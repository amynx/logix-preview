// Controlador del análisis: mantiene la única fuente de verdad (el análisis
// actual) y coordina el flujo acción → estado → persistencia → vista.
// El auto-guardado es con debounce para no escribir en IndexedDB en cada tecla.

import {
  createAnalysis,
  createRow,
  addRow,
  removeRow,
  moveRow,
  updateRow,
  updateAnalysisInfo,
  updateData,
  addInput,
  setNameConvention,
  conventionalName,
  removeData,
  listInputs,
  addExistingRowInput,
  removeRowInput,
  updateRowResult,
  findData,
  rowsUsingData,
  addStudent,
  updateStudent,
  removeStudent,
  conditionRows,
  conditionLabel,
} from "../models/analysisModel.js";
import { createStudentGradeExample } from "../models/exampleAnalysis.js";
import { confirmDialog, messageDialog, selectSectionsDialog } from "../views/dialogs.js";
import { PDF_SECTIONS } from "../views/pdfView.js";
import { exportAnalysis, importAnalysis } from "../services/file/fileService.js";
import { collectAnalysisWarnings, migrateAnalysis } from "../validation/analysisValidation.js";
import { buildChain } from "../models/chainModel.js";
import { inferResultType } from "../models/operators.js";
import { trackEvent } from "../utils/analytics.js";
import { setStageStatus, revealSection, goToStage, getActiveStage, STAGES } from "../views/stageNav.js";

const DEFAULT_SAVE_DELAY = 500;

// Extrae un valor evidente (el primer número) de un fragmento del enunciado. Si no
// hay ninguno, devuelve "" y el estudiante lo completa. Es solo una ayuda editable.
function valueFromFragment(fragment) {
  const match = String(fragment).match(/-?\d+(?:[.,]\d+)?/);
  return match ? match[0] : "";
}

// Una actividad está "pendiente" (aún sin razonamiento) si el estudiante no ha
// puesto nada útil todavía: sirve para marcar su estado en la lista de actividades.
function isRowEmpty(row) {
  const hasOperation = Array.isArray(row.operation) && row.operation.length > 0;
  return (
    !(row.problem ?? "").trim() &&
    (row.inputIds?.length ?? 0) === 0 &&
    !hasOperation &&
    !(row.condition ?? "").trim() &&
    !row.resultId &&
    !(row.conditionName ?? "").trim() &&
    !(row.purpose ?? "").trim()
  );
}

const isFilled = (value) => (value ?? "").toString().trim().length > 0;

// Una actividad está "lista" cuando tiene definidos todos sus campos activos, salvo
// el comentario. Los campos activos dependen del tipo y, en una condición, de si se
// evalúa ahora (produce un dato lógico, propósito y, si decide, sus caminos) o queda
// reutilizable (solo la comprobación). `resolveData` da el dato producido por id.
function isRowComplete(row, resolveData) {
  const result = row.resultId ? resolveData(row.resultId) : null;
  const resultOk = Boolean(result && result.name.trim() && result.type);
  const purposeOk = isFilled(row.purpose);
  const hasExpression = Array.isArray(row.operation) && row.operation.length > 0;

  if (row.kind === "condition") {
    const checkOk = isFilled(row.condition) && isFilled(row.conditionName) && hasExpression;
    if (!row.evaluateNow) return checkOk; // reutilizable: solo la comprobación
    // El dato lógico solo indica "se usa en" cuando alimenta una nueva operación;
    // una decisión se resuelve con sus caminos, no con una actividad asociada.
    const usedInOk = row.purpose !== "operation" || Boolean(row.usedInRowId);
    const pathsOk = row.purpose !== "decision" || (Boolean(row.ifTrue?.type) && Boolean(row.ifFalse?.type));
    return checkOk && resultOk && purposeOk && usedInOk && pathsOk;
  }
  // Operación: el dato producido debe indicar dónde se reutiliza cuando alimenta
  // otra operación o una decisión posterior.
  const usedInOk = !(row.purpose === "operation" || row.purpose === "decision") || Boolean(row.usedInRowId);
  return isFilled(row.problem) && (row.inputIds?.length ?? 0) > 0 && hasExpression && resultOk && purposeOk && usedInOk;
}

export class AnalysisController {
  #saveTimer = null;
  #history = []; // instantáneas del análisis para deshacer/rehacer
  #historyIndex = -1;
  #lastRecordAt = 0;
  #restoring = false;

  constructor({ analysisView, studentsView, inputsView, tableView, cardsView, chainView, completenessView, pdfView, storage, saveDelay = DEFAULT_SAVE_DELAY }) {
    this.analysisView = analysisView;
    this.studentsView = studentsView;
    this.inputsView = inputsView;
    this.completenessView = completenessView;
    this.tableView = tableView;
    this.cardsView = cardsView;
    this.viewMode = "cards"; // única vista activa: tarjetas (la de filas está desactivada)
    this.chainView = chainView;
    this.pdfView = pdfView;
    this.storage = storage;
    this.saveDelay = saveDelay;
    this.analysis = null;
    this.editingRows = new Set(); // ids de actividades en modo edición (estado de vista)
    this.selectedRowId = null; // actividad activa en el espacio de trabajo (tarjetas)
    this.editingInputs = false; // sección de datos de entrada en modo edición
    this.showStatement = false; // mostrar el enunciado (opcional) en la sección 2
  }

  async start() {
    this.analysisView.renderToolbar({
      onNew: () => this.newAnalysis(),
      onOpenFile: (file) => this.openFile(file),
      onSaveFile: () => this.saveToFile(),
      onExportPdf: () => this.exportPdf(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
    });
    this.analysisView.renderStatus();
    this.#registerShortcuts();
    const { analysis, editingRowIds } = await this.#recoverOrCreate();
    this.analysis = analysis;
    this.editingRows = new Set(editingRowIds);
    this.showStatement = Boolean(this.analysis.statement?.trim());
    this.render();
    this.#resetHistory();
  }

  // Atajos de teclado (Zen). Se usa `event.code` (independiente de la distribución).
  // Dentro de un campo de texto se respeta el comportamiento nativo (deshacer, etc.),
  // salvo Guardar, que siempre aplica y evita el diálogo del navegador.
  #registerShortcuts() {
    document.addEventListener("keydown", (event) => {
      const tag = event.target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable;
      const mod = event.ctrlKey || event.metaKey;

      // Guardar a archivo (Cmd/Ctrl+S).
      if (mod && event.code === "KeyS") {
        event.preventDefault();
        this.saveToFile();
        return;
      }
      // Deshacer / rehacer (fuera de campos de texto, para no pisar el nativo).
      if (mod && !typing && (event.code === "KeyZ" || event.code === "KeyY")) {
        event.preventDefault();
        if (event.code === "KeyY" || event.shiftKey) this.redo();
        else this.undo();
        return;
      }
      // Ir a etapa: Alt+1..4 (o Cmd/Ctrl+1..4 si el navegador no los intercepta).
      if ((event.altKey || mod) && !typing && /^Digit[1-4]$/.test(event.code)) {
        const stage = STAGES[Number(event.code.slice(-1)) - 1];
        if (stage) {
          event.preventDefault();
          goToStage(stage.id);
        }
        return;
      }
      // Esc: cierra el menú de ayuda si está abierto y desenfoca.
      if (event.code === "Escape") {
        const menu = document.getElementById("help-menu");
        if (menu?.classList.contains("flex")) menu.classList.replace("flex", "hidden");
        document.activeElement?.blur?.();
        return;
      }
      // Selección con flechas ↑/↓ en la lista de actividades (etapa Construcción).
      if (!mod && !event.altKey && !typing && getActiveStage() === "construccion" && (event.code === "ArrowUp" || event.code === "ArrowDown")) {
        event.preventDefault();
        this.#selectAdjacentActivity(event.code === "ArrowDown" ? 1 : -1);
        return;
      }
      // Zoom de la etapa Cadena: + / − / 0 (sin modificador, fuera de campos).
      if (!mod && !event.altKey && !typing && getActiveStage() === "cadena") {
        const clickZoom = (label) => document.querySelector(`button[aria-label="${label}"]`)?.click();
        if (event.code === "Equal") {
          event.preventDefault();
          clickZoom("Acercar");
        } else if (event.code === "Minus") {
          event.preventDefault();
          clickZoom("Alejar");
        } else if (event.code === "Digit0") {
          event.preventDefault();
          clickZoom("Ajustar a la vista");
        }
      }
    });
  }

  render() {
    this.renderStudents();
    this.renderInfo();
    this.renderInputs();
    this.renderTable();
    this.renderCompleteness();
    this.renderChain();
    this.#updateStageStatus();
  }

  // Marca cada etapa como completa según el modelo, para que el paso superior
  // muestre el avance real del razonamiento (✓ hecha / ○ pendiente).
  #updateStageStatus() {
    const hasTitle = Boolean(this.analysis.title?.trim());
    const hasData = this.analysis.data.length > 0;
    const hasRows = this.analysis.rows.length > 0;
    const warnings = collectAnalysisWarnings(this.analysis);
    const chain = buildChain(this.analysis);
    setStageStatus({
      problema: hasTitle ? "done" : "todo",
      datos: hasData ? "done" : "todo",
      construccion: hasRows && warnings.length === 0 ? "done" : "todo",
      cadena: chain.salidas.length > 0 ? "done" : "todo",
    });
  }

  renderCompleteness() {
    this.completenessView.render(collectAnalysisWarnings(this.analysis), {
      onFocusActivity: (rowId) => this.focusActivity(rowId),
    });
  }

  // Salta a una actividad desde un aviso de completitud: la abre en edición y la
  // desplaza a la vista.
  focusActivity(rowId) {
    if (!this.analysis.rows.some((row) => row.id === rowId)) return;
    revealSection("table-container"); // la actividad vive en la etapa «Construcción»
    this.selectedRowId = rowId; // ábrela en el espacio de trabajo (vista de tarjetas)
    this.setRowEditing(rowId, true);
    const card = document.querySelector(`#table-container [data-row-id="${rowId}"]`);
    if (card && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }

  renderStudents() {
    this.studentsView.render(this.analysis.group, this.analysis.students, {
      onGroupChange: (group) => this.updateInfo({ group }),
      onAddStudent: (name) => this.addStudent(name),
      onStudentChange: (studentId, changes) => this.updateStudent(studentId, changes),
      onRemoveStudent: (studentId) => this.removeStudent(studentId),
    });
  }

  // Agregar un integrante (con el nombre del borrador, si lo hay) y re-dibujar el
  // control; el panel sigue abierto.
  addStudent(name = "") {
    const student = addStudent(this.analysis);
    if (name.trim()) updateStudent(this.analysis, student.id, { fullName: name.trim() });
    this.renderStudents();
    this.#afterChange();
  }

  // El campo editado conserva el foco; la sección no se re-renderiza al teclear.
  updateStudent(studentId, changes) {
    updateStudent(this.analysis, studentId, changes);
    this.#afterChange();
  }

  removeStudent(studentId) {
    removeStudent(this.analysis, studentId);
    this.renderStudents();
    this.#afterChange();
  }

  renderInputs() {
    this.inputsView.render(listInputs(this.analysis), this.editingInputs, {
      onAddInput: () => this.addInput(),
      onInputChange: (dataId, changes) => this.updateInput(dataId, changes),
      onRemoveInput: (dataId) => this.removeInput(dataId),
      onEditInputs: () => this.setEditingInputs(true),
      onDoneInputs: () => this.setEditingInputs(false),
      onSetNameConvention: (convention) => this.setNameConvention(convention),
      formatName: (name) => conventionalName(this.analysis, name),
    }, this.showStatement, this.analysis.nameConvention, this.#producedData());
  }

  // Datos que produce cada actividad (para la tarjeta "Datos resultantes" de solo
  // lectura): el dato y la actividad que lo genera.
  #producedData() {
    const dataById = new Map(this.analysis.data.map((entry) => [entry.id, entry]));
    return this.analysis.rows
      .map((row, index) => {
        const datum = row.resultId ? dataById.get(row.resultId) : null;
        if (!datum) return null;
        const detail = (row.problem ?? "").trim() || (row.kind === "condition" ? conditionLabel(this.analysis, row.id) : "");
        return { datum, activity: `Actividad ${index + 1}${detail ? ` · ${detail}` : ""}` };
      })
      .filter(Boolean);
  }

  // Fija la convención de nombres como regla del análisis y la aplica a todos los
  // datos (entradas y resultados). Se re-renderiza para reflejar los nombres.
  setNameConvention(convention) {
    setNameConvention(this.analysis, convention);
    this.renderInputs();
    this.renderTable();
    this.#afterChange();
    trackEvent("set_name_convention", { convention });
  }

  setEditingInputs(editing) {
    this.editingInputs = editing;
    this.renderInputs();
  }

  // Alta de un dato de entrada: aparece en la sección y en los selectores de las filas.
  // Agregar un dato entra (o permanece) en modo edición para poder completarlo.
  addInput() {
    addInput(this.analysis);
    this.editingInputs = true;
    this.renderInputs();
    this.renderTable();
    this.#afterChange();
    trackEvent("add_input");
  }

  // Edición de un dato de entrada desde su sección. Se re-renderiza la tabla (para
  // reflejar las fichas), sin tocar la sección: el campo editado conserva el foco.
  updateInput(dataId, changes) {
    updateData(this.analysis, dataId, changes);
    this.renderTable();
    this.#afterChange();
  }

  removeInput(dataId) {
    removeData(this.analysis, dataId);
    this.renderInfo(); // refresca los fragmentos resaltados del enunciado y el recuento
    this.renderInputs();
    this.renderTable();
    this.#afterChange();
  }

  renderChain() {
    this.chainView.render(buildChain(this.analysis));
  }

  // Tras cualquier cambio del modelo: refresca la cadena derivada y agenda el guardado.
  #afterChange() {
    this.#recordHistory();
    this.renderCompleteness();
    this.renderChain();
    this.#updateStageStatus();
    this.#scheduleSave();
  }

  // --- Historial (deshacer / rehacer) ---

  // Registra el estado tras un cambio. Los cambios muy seguidos (p. ej. teclear)
  // se agrupan en una sola entrada para que deshacer no vaya carácter por carácter.
  #recordHistory() {
    if (this.#restoring) return;
    if (this.#historyIndex < this.#history.length - 1) {
      this.#history.splice(this.#historyIndex + 1); // descarta el "rehacer" pendiente
    }
    const snapshot = structuredClone(this.analysis);
    const now = Date.now();
    if (now - this.#lastRecordAt < 600 && this.#historyIndex > 0) {
      this.#history[this.#historyIndex] = snapshot;
    } else {
      this.#history.push(snapshot);
      this.#historyIndex = this.#history.length - 1;
      if (this.#history.length > 100) {
        this.#history.shift();
        this.#historyIndex--;
      }
    }
    this.#lastRecordAt = now;
    this.#updateHistoryButtons();
  }

  #resetHistory() {
    this.#history = [structuredClone(this.analysis)];
    this.#historyIndex = 0;
    this.#lastRecordAt = 0;
    this.#updateHistoryButtons();
  }

  undo() {
    if (this.#historyIndex <= 0) return;
    this.#historyIndex--;
    this.#restoreFromHistory();
  }

  redo() {
    if (this.#historyIndex >= this.#history.length - 1) return;
    this.#historyIndex++;
    this.#restoreFromHistory();
  }

  #restoreFromHistory() {
    this.#restoring = true;
    this.analysis = structuredClone(this.#history[this.#historyIndex]);
    // Descarta el modo edición de filas que ya no existen tras restaurar.
    this.editingRows = new Set([...this.editingRows].filter((id) => this.analysis.rows.some((row) => row.id === id)));
    this.render();
    this.#restoring = false;
    this.#scheduleSave();
    this.#updateHistoryButtons();
  }

  #updateHistoryButtons() {
    this.analysisView.setHistoryState(this.#historyIndex > 0, this.#historyIndex < this.#history.length - 1);
  }

  renderInfo() {
    this.analysisView.renderInfo(this.analysis, {
      onTitleChange: (title) => this.updateInfo({ title }),
      onDescriptionChange: (description) => this.updateInfo({ description }),
      onStatementChange: (statement) => this.updateInfo({ statement }),
      onAddDataFromSelection: (fragment) => this.addDataFromSelection(fragment),
      onRemoveFragment: (dataId) => this.removeInput(dataId),
      isFragmentAdded: (fragment) => this.analysis.data.some((entry) => (entry.source ?? "").trim() === fragment),
      showStatement: this.showStatement,
      onToggleStatement: () => this.toggleStatement(),
      getDataMentions: () => this.#dataMentions(),
    });
  }

  // El enunciado es opcional: se muestra u oculta según lo necesite el estudiante.
  toggleStatement() {
    this.showStatement = !this.showStatement;
    this.renderInfo();
    this.renderInputs(); // la estructura de columnas de la sección 3 depende del enunciado
  }

  // Convierte un fragmento seleccionado del enunciado en un dato de entrada: guarda
  // el fragmento como origen y extrae un valor evidente (editable). El estudiante
  // completa el tipo y el nombre. No decide el nombre por él.
  addDataFromSelection(fragment) {
    const text = fragment.trim();
    if (!text) return;
    addInput(this.analysis, { source: text, value: valueFromFragment(text) });
    this.editingInputs = true;
    this.renderInfo(); // el fragmento pasa a estar resaltado en el enunciado
    this.renderInputs();
    this.renderTable();
    this.#afterChange();
    trackEvent("add_data_from_selection");
  }

  // Vista activa de las actividades. En el producto solo se usa tarjetas (la vista
  // de filas está desactivada: no hay selector). `tableView` se conserva como
  // renderizador alternativo (se ejercita en pruebas) por si se reactiva.
  #activityView() {
    return this.viewMode === "table" && this.tableView ? this.tableView : this.cardsView;
  }

  // Alterna una actividad entre modo edición y modo visualización. Es estado de
  // vista (no se persiste): al terminar, la actividad muestra solo su información.
  // Conserva el scroll (no debe saltar a la primera tarjeta al editar la última).
  setRowEditing(rowId, editing) {
    if (editing) this.editingRows.add(rowId);
    else this.editingRows.delete(rowId);
    this.#renderTableKeepingFocus();
  }

  renderTable() {
    this.#activityView().render(this.analysis, this.#tableHandlers(), this.viewMode);
  }

  // Re-render que conserva el foco y el cursor: para cambios de datos (crear/
  // renombrar) que deben refrescar los selectores de otras celdas al vuelo.
  #renderTableKeepingFocus() {
    this.#activityView().renderKeepingFocus(this.analysis, this.#tableHandlers(), this.viewMode);
  }

  // Selecciona la actividad que ocupa el espacio de trabajo (vista de tarjetas
  // master-detail). Es estado de vista: no se persiste.
  selectActivity(rowId) {
    if (!this.analysis.rows.some((row) => row.id === rowId)) return;
    this.selectedRowId = rowId;
    this.#renderTableKeepingFocus();
  }

  // Mueve la selección a la actividad anterior/siguiente de la lista (flechas ↑/↓).
  // Sin selección previa, ↓ toma la primera y ↑ la última.
  #selectAdjacentActivity(delta) {
    const rows = this.analysis.rows;
    if (rows.length === 0) return;
    // Sin selección explícita, el espacio de trabajo muestra la primera actividad,
    // así que se parte de ella (índice 0) para que la primera ↓ avance a la segunda.
    const current = rows.findIndex((row) => row.id === this.selectedRowId);
    const base = current === -1 ? 0 : current;
    const nextIndex = Math.min(rows.length - 1, Math.max(0, base + delta));
    const target = rows[nextIndex];
    if (target && target.id !== this.selectedRowId) this.selectActivity(target.id);
  }

  // Estado de una actividad para la lista, según su propio contenido: revisar (tiene
  // un aviso), completa (todos sus campos activos definidos salvo el comentario),
  // pendiente (aún sin información) o en construcción (empezada pero incompleta).
  #activityStatus(rowId, warnRowIds) {
    if (warnRowIds.has(rowId)) return "warn";
    const row = this.analysis.rows.find((candidate) => candidate.id === rowId);
    if (!row) return "todo";
    if (isRowComplete(row, (id) => findData(this.analysis, id))) return "done";
    if (isRowEmpty(row)) return "todo";
    return "active";
  }

  #tableHandlers() {
    const warnRowIds = new Set(collectAnalysisWarnings(this.analysis).map((w) => w.rowId).filter(Boolean));
    return {
      isRowEditing: (rowId) => this.editingRows.has(rowId),
      onEditRow: (rowId) => this.setRowEditing(rowId, true),
      onDoneRow: (rowId) => this.setRowEditing(rowId, false),
      selectedRowId: () => this.selectedRowId,
      onSelectRow: (rowId) => this.selectActivity(rowId),
      rowStatus: (rowId) => this.#activityStatus(rowId, warnRowIds),
      onFieldChange: (rowId, changes) => this.updateRowField(rowId, changes),
      onStructuralChange: (rowId, changes) => this.updateRowStructure(rowId, changes),
      onAddRow: (kind) => this.addRow(kind),
      conditionPlaceholder: (rowId) => conditionLabel(this.analysis, rowId),
      onDeleteRow: (rowId) => this.deleteRow(rowId),
      onMoveRow: (fromRowId, toRowId) => this.moveRow(fromRowId, toRowId),
      onDataChange: (dataId, changes) => this.updateData(dataId, changes),
      onResultChange: (rowId, changes) => this.updateResult(rowId, changes),
      onReuseInput: (rowId, dataId) => this.reuseInput(rowId, dataId),
      onRemoveRowInput: (rowId, dataId) => this.removeRowInput(rowId, dataId),
      onUsedInChange: (rowId, usedInRowId) => this.setUsedIn(rowId, usedInRowId),
      onOperationChange: (rowId, tokensUpdater) => this.updateOperation(rowId, tokensUpdater),
      formatName: (name) => conventionalName(this.analysis, name),
      getDataMentions: () => this.#dataMentions(),
      conditionEntries: () => conditionRows(this.analysis).map((row) => ({ id: row.id, label: conditionLabel(this.analysis, row.id) })),
      resolveCondition: (condId) => (conditionRows(this.analysis).some((row) => row.id === condId) ? { label: conditionLabel(this.analysis, condId) } : null),
    };
  }

  // Datos disponibles para mencionar en los campos de texto (menú "/"): entradas y
  // resultados con nombre, marcando cuáles produce otra actividad.
  #dataMentions() {
    const produced = new Set(this.analysis.rows.map((row) => row.resultId).filter(Boolean));
    return this.analysis.data
      .filter((entry) => (entry.name ?? "").trim())
      .map((entry) => ({ id: entry.id, name: entry.name, type: entry.type, produced: produced.has(entry.id) }));
  }

  // Cambia la operación (lista de tokens) y sugiere el tipo del dato resultante
  // cuando aún no tiene uno, según los operadores usados.
  updateOperation(rowId, tokensUpdater) {
    const row = this.analysis.rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    updateRow(this.analysis, rowId, { operation: tokensUpdater(row.operation) });
    this.#suggestResultType(row);
    this.#renderTableKeepingFocus(); // conserva el foco del constructor de expresiones
    this.#afterChange();
  }

  // Sugiere y aplica el tipo del dato resultante si aún no tiene uno.
  #suggestResultType(row) {
    if (!row.resultId) return;
    const result = findData(this.analysis, row.resultId);
    if (!result || result.type) return; // no sobrescribir un tipo ya elegido
    const inferred = inferResultType(row.operation);
    if (inferred) updateData(this.analysis, row.resultId, { type: inferred });
  }

  // Edición de nombre/tipo de un dato: se re-renderiza la tabla conservando el
  // foco, de modo que las referencias y selectores de otras celdas se actualicen
  // al instante (nombre en fichas reutilizadas, opciones de "+ dato", etc.).
  updateData(dataId, changes) {
    updateData(this.analysis, dataId, changes);
    this.#renderTableKeepingFocus();
    this.#afterChange();
  }

  // El dato resultante se crea de forma diferida leyendo el resultId actual de la
  // fila. Al crearlo, otras celdas ya pueden referenciarlo (re-render con foco).
  updateResult(rowId, changes) {
    updateRowResult(this.analysis, rowId, changes);
    const row = this.analysis.rows.find((candidate) => candidate.id === rowId);
    if (row) this.#suggestResultType(row);
    this.#renderTableKeepingFocus();
    this.#afterChange();
  }

  // Vincula (o desvincula) el dato producido de la fila con la actividad donde se
  // usará. El valor puede ser "" (sin asignar), "pending" o el id de una actividad.
  setUsedIn(rowId, usedInRowId) {
    updateRow(this.analysis, rowId, { usedInRowId });
    this.#renderTableKeepingFocus();
    this.#afterChange();
  }

  // Al reutilizar un dato en la fila se conserva la posición de scroll (no debe
  // saltar a otra tarjeta) para no interrumpir la construcción de la expresión.
  reuseInput(rowId, dataId) {
    addExistingRowInput(this.analysis, rowId, dataId);
    this.#renderTableKeepingFocus();
    this.#afterChange();
  }

  removeRowInput(rowId, dataId) {
    removeRowInput(this.analysis, rowId, dataId);
    this.#renderTableKeepingFocus();
    this.#afterChange();
  }

  updateInfo(changes) {
    updateAnalysisInfo(this.analysis, changes);
    this.#afterChange();
  }

  updateRowField(rowId, updater) {
    const changes = this.#resolveRowChanges(rowId, updater);
    if (!changes) return;
    updateRow(this.analysis, rowId, changes);
    this.#afterChange();
  }

  updateRowStructure(rowId, updater) {
    const changes = this.#resolveRowChanges(rowId, updater);
    if (!changes) return;
    updateRow(this.analysis, rowId, changes);
    this.#renderTableKeepingFocus(); // conserva el foco del constructor en las ramas
    this.#afterChange();
  }

  // Resuelve el actualizador contra la fila actual del modelo, de modo que cada
  // cambio parta del estado fresco y no de una copia capturada en el render.
  #resolveRowChanges(rowId, updater) {
    const row = this.analysis.rows.find((candidate) => candidate.id === rowId);
    return row ? updater(row) : null;
  }

  // Una actividad nueva se abre en modo edición: aún no tiene información que ver.
  // `kind` distingue una operación (por defecto) de una condición reutilizable.
  addRow(kind = "operation") {
    addRow(this.analysis, createRow({ kind }));
    const newRow = this.analysis.rows[this.analysis.rows.length - 1];
    this.editingRows.add(newRow.id);
    this.selectedRowId = newRow.id; // la nueva actividad pasa a ser el espacio de trabajo
    this.renderTable();
    this.#afterChange();
    trackEvent(kind === "condition" ? "add_condition" : "add_activity");
  }

  async deleteRow(rowId) {
    const confirmed = await confirmDialog({
      title: "Eliminar fila",
      message: this.#deleteRowMessage(rowId),
    });
    if (!confirmed) return;
    const removedIndex = this.analysis.rows.findIndex((row) => row.id === rowId);
    removeRow(this.analysis, rowId);
    this.editingRows.delete(rowId);
    // Si se borró la actividad activa, selecciona una vecina para no dejar el
    // espacio de trabajo vacío mientras queden actividades.
    if (this.selectedRowId === rowId) {
      const neighbor = this.analysis.rows[removedIndex] ?? this.analysis.rows[removedIndex - 1] ?? null;
      this.selectedRowId = neighbor?.id ?? null;
    }
    this.renderTable();
    this.#afterChange();
  }

  // Advierte si la fila produce un dato reutilizado por otras filas, porque al
  // borrarla ese dato y sus referencias también desaparecerán.
  #deleteRowMessage(rowId) {
    const row = this.analysis.rows.find((candidate) => candidate.id === rowId);
    const consumers = row?.resultId
      ? rowsUsingData(this.analysis, row.resultId).filter((candidate) => candidate.id !== rowId)
      : [];
    if (consumers.length === 0) {
      return "Se eliminará esta fila del análisis. Esta acción no se puede deshacer.";
    }
    const datum = findData(this.analysis, row.resultId);
    const name = datum?.name ? `"${datum.name}"` : "que produce";
    return `Esta fila produce el dato ${name}, reutilizado en ${consumers.length} fila(s). Al eliminarla, ese dato y sus referencias también se quitarán.`;
  }

  moveRow(fromRowId, toRowId) {
    const { rows } = this.analysis;
    const fromIndex = rows.findIndex((row) => row.id === fromRowId);
    const toIndex = rows.findIndex((row) => row.id === toRowId);
    if (fromIndex === -1 || toIndex === -1) return;
    moveRow(this.analysis, fromIndex, toIndex);
    this.renderTable();
    this.#afterChange();
  }

  // Reemplaza el análisis actual y refresca vista y persistencia. Es el punto
  // único por el que entra un análisis nuevo, importado o recuperado.
  loadAnalysis(analysis, editingRowIds = []) {
    this.analysis = analysis;
    this.editingRows = new Set(editingRowIds);
    this.editingInputs = false; // la sección de datos empieza en modo visualización
    this.showStatement = Boolean(analysis.statement?.trim()); // muestra el enunciado si lo trae
    this.render();
    this.#afterChange();
    this.#resetHistory(); // un análisis cargado empieza un historial nuevo
  }

  newAnalysis() {
    const analysis = createAnalysis();
    addRow(analysis);
    const seededRow = analysis.rows[analysis.rows.length - 1];
    this.loadAnalysis(analysis, [seededRow.id]);
    trackEvent("new_analysis");
  }

  // Carga un análisis de ejemplo completo (en modo visualización) para aprender de
  // un caso terminado. Es un análisis nuevo más; el anterior sigue en el historial.
  // Carga el ejemplo del tutorial guiado (¿el estudiante aprueba?). Abre la sección
  // de datos en edición para que se vea la traza fragmento → valor → nombre.
  loadStudentGradeExample() {
    this.loadAnalysis(createStudentGradeExample());
    this.editingInputs = true;
    this.renderInputs();
  }

  async saveToFile() {
    const warnings = collectAnalysisWarnings(this.analysis);
    if (warnings.length > 0) {
      const proceed = await confirmDialog({
        title: "Revisa el análisis antes de guardar",
        message: "Hay algunos puntos por completar. Puedes guardarlo igualmente:",
        details: warnings,
        confirmLabel: "Guardar de todos modos",
        cancelLabel: "Revisar",
      });
      if (!proceed) return;
    }
    exportAnalysis(this.analysis);
    trackEvent("save_file");
  }

  // Exporta a PDF: el usuario elige las secciones; la fecha/hora es automática.
  async exportPdf() {
    const sections = await selectSectionsDialog(PDF_SECTIONS, { title: "Exportar a PDF" });
    if (!sections) return;
    this.pdfView.print(this.analysis, { sections, exportedAt: new Date().toISOString() });
    trackEvent("export_pdf", { sections: sections.length });
  }

  async openFile(file) {
    try {
      const analysis = await importAnalysis(file);
      this.loadAnalysis(analysis);
      trackEvent("open_file");
    } catch (error) {
      // Aviso informativo: no se bloquea el flujo esperando a que se cierre.
      messageDialog({ title: "No se pudo abrir el análisis", message: error.message });
    }
  }

  // Recupera el análisis más reciente guardado localmente; si no hay ninguno,
  // crea uno nuevo con una fila lista para editar.
  async #recoverOrCreate() {
    try {
      const stored = await this.storage.getAllAnalyses();
      if (stored && stored.length > 0) {
        const latest = stored.reduce((newest, item) => (item.updatedAt > newest.updatedAt ? item : newest));
        // Migra por si el auto-guardado quedó en un formato anterior. Un análisis
        // recuperado se muestra en modo visualización (sin ninguna fila en edición).
        return { analysis: migrateAnalysis(latest), editingRowIds: [] };
      }
    } catch (error) {
      console.error("No se pudo recuperar el análisis guardado:", error);
    }
    // Análisis nuevo: su fila inicial se abre en modo edición.
    const analysis = createAnalysis();
    addRow(analysis);
    const seededRow = analysis.rows[analysis.rows.length - 1];
    return { analysis, editingRowIds: [seededRow.id] };
  }

  #scheduleSave() {
    this.analysisView.setSaveStatus("saving");
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.#save(), this.saveDelay);
  }

  async #save() {
    try {
      await this.storage.saveAnalysis(this.analysis);
      this.analysisView.setSaveStatus("saved");
    } catch (error) {
      console.error("No se pudo guardar automáticamente:", error);
      this.analysisView.setSaveStatus("error");
    }
  }
}
