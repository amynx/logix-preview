// Modelo del análisis: fábricas y operaciones sobre el estado.
// Datos planos y serializables, sin dependencias del DOM ni de la persistencia.
// Las operaciones mutan el análisis recibido y refrescan updatedAt, manteniendo
// una única fuente de verdad que el controlador coordina con la vista y el storage.

import { createId } from "../utils/id.js";
import { applyNameConvention } from "./nameConventions.js";

// Versión del formato del análisis. v5: la condición es texto libre. v6: uso
// posterior y ramas como expresiones. v7: el uso posterior vuelve a texto (un
// "comentario"). v8: se registra la información de los estudiantes. v9: cada fila
// puede declarar en qué actividad se usará su dato producido (o dejarlo pendiente).
// v10: la información de estudiantes se reduce al grupo (todos comparten grupo).
// v11: se registran de nuevo los estudiantes (id, nombre), pero el grupo sigue
// siendo un único campo compartido por todos (ya no es propio de cada estudiante).
// v12: se registra el enunciado del problema y cada dato conserva el fragmento del
// enunciado del que salió (`source`) y su valor (`value`).
// v13: la condición de cada actividad es opcional y explícita. v14: la convención
// de nombres se recuerda como regla del análisis. v15: catálogo de condiciones
// reutilizables. v16: las condiciones son actividades (kind "condition"), no un
// catálogo aparte; se componen con Y/O/NO en actividades de operación. v17: una
// condición puede evaluarse en el momento (`evaluateNow`) y, como decisión, lleva
// sus caminos; las operaciones ya no deciden. v18: cada camino de una decisión que
// continúa (nueva operación / otra decisión) puede apuntar a la actividad concreta
// en la que sigue (`targetRowId`), igual que `usedInRowId` para el dato producido.
export const ANALYSIS_VERSION = 18;

// Valor de `usedInRowId` cuando el dato producido se usará en una actividad que
// aún no existe: la relación queda pendiente de asignar a una actividad concreta.
export const PENDING_ACTIVITY = "pending";

export function createDataEntry(overrides = {}) {
  // `source`: fragmento del enunciado del que salió el dato. `value`: su valor.
  return { id: createId(), name: "", type: "", source: "", value: "", ...overrides };
}

// Un estudiante que participa en el análisis. El grupo es común a todos, así que
// no se guarda aquí, sino una sola vez en el análisis (`analysis.group`).
export function createStudent(overrides = {}) {
  return { id: createId(), idNumber: "", fullName: "", ...overrides };
}

export function createBranch(overrides = {}) {
  // `targetRowId`: actividad en la que sigue este camino cuando continúa (no
  // finaliza). "" sin asignar · PENDING_ACTIVITY pendiente · id de la actividad.
  return { type: "", value: [], targetRowId: "", ...overrides };
}

export function createRow(overrides = {}) {
  return {
    id: createId(),
    // Tipo de actividad: "operation" (produce un dato) o "condition" (descubre una
    // comprobación reutilizable, sin dato resultante hasta componerla). Cada tipo
    // muestra campos distintos.
    kind: "operation",
    conditionName: "", // nombre de la condición (para kind "condition"); vacío → "C1"…
    evaluateNow: false, // condición: ¿se evalúa ahora (produce dato lógico) o se reutiliza?
    problem: "",
    inputIds: [],
    condition: "",
    operation: [],
    resultId: null,
    purpose: "",
    usedInRowId: "", // "" sin asignar · PENDING_ACTIVITY · id de la actividad destino
    subsequentUse: "",
    ifTrue: createBranch(),
    ifFalse: createBranch(),
    ...overrides,
  };
}

export function createAnalysis(overrides = {}) {
  const now = new Date().toISOString();
  return {
    version: ANALYSIS_VERSION,
    id: createId(),
    title: "",
    description: "",
    statement: "", // enunciado completo del problema (para identificar los datos)
    group: "",
    students: [],
    nameConvention: "", // convención de nombres vigente ("" = ninguna); regla del análisis
    data: [],
    rows: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// --- Estudiantes (el grupo es común y vive en analysis.group) ---

export function addStudent(analysis) {
  const student = createStudent();
  analysis.students.push(student);
  touch(analysis);
  return student;
}

export function updateStudent(analysis, studentId, changes) {
  const student = analysis.students.find((candidate) => candidate.id === studentId);
  if (!student) return analysis;
  Object.assign(student, changes);
  return touch(analysis);
}

export function removeStudent(analysis, studentId) {
  analysis.students = analysis.students.filter((student) => student.id !== studentId);
  return touch(analysis);
}

// Marca el análisis como modificado en este instante.
export function touch(analysis) {
  analysis.updatedAt = new Date().toISOString();
  return analysis;
}

export function addRow(analysis, row = createRow()) {
  analysis.rows.push(row);
  return touch(analysis);
}

// Elimina una fila. El dato que producía deja de tener origen, así que se quita
// del catálogo junto con sus referencias. Las entradas declaradas son globales y
// persisten (solo se quitan sus referencias al desaparecer la fila).
export function removeRow(analysis, rowId) {
  const row = analysis.rows.find((candidate) => candidate.id === rowId);
  if (!row) return analysis;

  const producedId = row.resultId;
  analysis.rows = analysis.rows.filter((candidate) => candidate.id !== rowId);
  if (producedId) removeData(analysis, producedId);
  // Si era una condición, se podan las referencias (tokens `cond`) que la usaban.
  if (row.kind === "condition") pruneCondReferences(analysis, rowId);
  // La actividad destino desaparece: las filas que la referenciaban vuelven a
  // quedar pendientes de asignación, conservando la intención de reutilización.
  // Igual para los caminos de decisión que continuaban en esa actividad.
  for (const candidate of analysis.rows) {
    if (candidate.usedInRowId === rowId) candidate.usedInRowId = PENDING_ACTIVITY;
    if (candidate.ifTrue.targetRowId === rowId) candidate.ifTrue.targetRowId = PENDING_ACTIVITY;
    if (candidate.ifFalse.targetRowId === rowId) candidate.ifFalse.targetRowId = PENDING_ACTIVITY;
  }
  return touch(analysis);
}

// Reordena una fila de una posición a otra, conservando todos sus datos.
export function moveRow(analysis, fromIndex, toIndex) {
  const { rows } = analysis;
  const lastIndex = rows.length - 1;
  if (fromIndex < 0 || fromIndex > lastIndex) return analysis;
  if (toIndex < 0 || toIndex > lastIndex) return analysis;
  if (fromIndex === toIndex) return analysis;

  const [moved] = rows.splice(fromIndex, 1);
  rows.splice(toIndex, 0, moved);
  return touch(analysis);
}

// Aplica cambios superficiales a una fila. Para campos anidados (result, ifTrue,
// ifFalse) el llamador pasa el objeto anidado completo ya combinado.
export function updateRow(analysis, rowId, changes) {
  const row = analysis.rows.find((candidate) => candidate.id === rowId);
  if (!row) return analysis;
  Object.assign(row, changes);
  return touch(analysis);
}

// Actualiza el título y/o la descripción del análisis.
export function updateAnalysisInfo(analysis, changes) {
  Object.assign(analysis, changes);
  return touch(analysis);
}

// --- Catálogo de datos (única fuente de verdad de nombre y tipo) ---

export function findData(analysis, dataId) {
  return analysis.data.find((entry) => entry.id === dataId) ?? null;
}

export function addData(analysis, values = {}) {
  const entry = createDataEntry(values);
  analysis.data.push(entry);
  touch(analysis);
  return entry;
}

export function updateData(analysis, dataId, changes) {
  const entry = findData(analysis, dataId);
  if (!entry) return analysis;
  Object.assign(entry, changes);
  return touch(analysis);
}

function withoutRef(tokens, dataId) {
  return Array.isArray(tokens) ? tokens.filter((token) => !(token.kind === "ref" && token.dataId === dataId)) : tokens;
}

// Elimina un dato del catálogo y todas sus referencias en las filas y condiciones:
// entradas, resultado y las que aparezcan en operación, uso posterior o ramas.
export function removeData(analysis, dataId) {
  analysis.data = analysis.data.filter((entry) => entry.id !== dataId);
  for (const row of analysis.rows) {
    row.inputIds = row.inputIds.filter((id) => id !== dataId);
    if (row.resultId === dataId) row.resultId = null;
    row.operation = withoutRef(row.operation, dataId);
    row.subsequentUse = withoutRef(row.subsequentUse, dataId);
    row.ifTrue.value = withoutRef(row.ifTrue.value, dataId);
    row.ifFalse.value = withoutRef(row.ifFalse.value, dataId);
  }
  return touch(analysis);
}

// --- Condiciones (actividades de tipo "condition") ---

// Actividades que son condiciones reutilizables, en orden de descubrimiento.
export function conditionRows(analysis) {
  return analysis.rows.filter((row) => row.kind === "condition");
}

// Nombre visible de una condición: el que le puso el estudiante o, si está vacío,
// una etiqueta genérica posicional (C1, C2…) según su orden entre las condiciones.
export function conditionLabel(analysis, rowId) {
  const conditions = conditionRows(analysis);
  const index = conditions.findIndex((row) => row.id === rowId);
  if (index === -1) return "?";
  const name = (conditions[index].conditionName ?? "").trim();
  return name || `C${index + 1}`;
}

function withoutCondRef(tokens, condId) {
  return Array.isArray(tokens) ? tokens.filter((token) => !(token.kind === "cond" && token.condId === condId)) : tokens;
}

// Poda toda referencia (token `cond`) a la fila-condición `condId` en el análisis.
function pruneCondReferences(analysis, condId) {
  for (const row of analysis.rows) {
    row.operation = withoutCondRef(row.operation, condId);
    row.subsequentUse = withoutCondRef(row.subsequentUse, condId);
    row.ifTrue.value = withoutCondRef(row.ifTrue.value, condId);
    row.ifFalse.value = withoutCondRef(row.ifFalse.value, condId);
  }
}

// Datos de entrada declarados: los del catálogo que ninguna operación produce.
// Se declaran una vez (en su sección) y las filas solo los referencian.
export function listInputs(analysis) {
  const produced = new Set(analysis.rows.map((row) => row.resultId).filter(Boolean));
  return analysis.data.filter((entry) => !produced.has(entry.id));
}

// Agrega un nuevo dato de entrada (vacío) al catálogo.
export function addInput(analysis, values = {}) {
  return addData(analysis, values);
}

// Fija la convención de nombres del análisis y la aplica a TODOS los datos —
// entradas y resultados de operaciones— para que la nomenclatura sea consistente.
// Una convención vacía ("ninguna") solo se guarda; no reformatea lo existente.
export function setNameConvention(analysis, convention) {
  analysis.nameConvention = convention;
  if (convention) {
    for (const entry of analysis.data) {
      entry.name = applyNameConvention(entry.name, convention);
    }
  }
  return touch(analysis);
}

// Aplica la convención vigente del análisis a un nombre (para reformatear al
// desenfocar un campo de nombre). Sin convención activa, lo devuelve igual.
export function conventionalName(analysis, name) {
  return applyNameConvention(name, analysis.nameConvention ?? "");
}

function tokensReference(tokens, dataId) {
  return Array.isArray(tokens) && tokens.some((token) => token.kind === "ref" && token.dataId === dataId);
}

// Filas que usan un dato: como entrada declarada, o referenciado en su operación,
// uso posterior o el detalle de una rama (para avisar antes de borrar su origen).
export function rowsUsingData(analysis, dataId) {
  return analysis.rows.filter(
    (row) =>
      row.inputIds.includes(dataId) ||
      tokensReference(row.operation, dataId) ||
      tokensReference(row.subsequentUse, dataId) ||
      tokensReference(row.ifTrue.value, dataId) ||
      tokensReference(row.ifFalse.value, dataId),
  );
}

// --- Referencias fila ↔ dato ---

// Reutiliza un dato de entrada declarado como entrada de la fila (comparte id).
export function addExistingRowInput(analysis, rowId, dataId) {
  const row = analysis.rows.find((candidate) => candidate.id === rowId);
  if (!row) return analysis;
  if (!row.inputIds.includes(dataId) && findData(analysis, dataId)) {
    row.inputIds.push(dataId);
    touch(analysis);
  }
  return analysis;
}

// Quita la referencia a un dato de entrada de la fila. El dato declarado persiste;
// solo se elimina desde su sección.
export function removeRowInput(analysis, rowId, dataId) {
  const row = analysis.rows.find((candidate) => candidate.id === rowId);
  if (!row) return analysis;
  row.inputIds = row.inputIds.filter((id) => id !== dataId);
  return touch(analysis);
}

// Edita el dato resultante de la fila. Lo crea de forma diferida la primera vez
// que se le asigna nombre o tipo, leyendo siempre el resultId actual de la fila.
export function updateRowResult(analysis, rowId, changes) {
  const row = analysis.rows.find((candidate) => candidate.id === rowId);
  if (!row) return analysis;
  if (row.resultId) {
    updateData(analysis, row.resultId, changes);
  } else {
    const entry = addData(analysis, changes);
    row.resultId = entry.id;
  }
  return touch(analysis);
}
