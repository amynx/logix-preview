// Constructores de los campos editables de una actividad (fila), compartidos por
// la vista de tabla y la de tarjetas para que ambas ofrezcan exactamente las
// mismas funciones sobre el mismo modelo. Solo se ocupa del DOM.

import { el, clear } from "../utils/dom.js";
import { DATA_TYPES, BRANCH_TYPES, PURPOSES, optionsOf, labelOf } from "../models/dataTypes.js";
import { OPERATOR_GROUPS, OPERATOR_SYMBOLS } from "../models/operators.js";
import { capitalizeFirst, formatAsQuestion } from "../models/textNormalization.js";
import { attachMentions } from "./mentionMenu.js";
import { typeBadge } from "./badges.js";
import { icon } from "./icons.js";
import { PENDING_ACTIVITY } from "../models/analysisModel.js";

// Estilo discreto: sin borde ni fondo hasta pasar el cursor o enfocar.
const CONTROL_CLASS =
  "w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-slate-900 " +
  "outline-none hover:border-slate-200 hover:bg-slate-50 focus:border-[oklch(0.72_0.09_300)] focus:bg-[var(--lx-surface)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)] " +
  "disabled:cursor-not-allowed disabled:text-slate-300";

// Orden y etiquetas de los campos de una actividad (usado por ambas vistas).
export const FIELD_ORDER = [
  { key: "problem", label: "Problema / Necesidad", help: "Sub-necesidad de este paso (opcional)." },
  { key: "inputs", label: "Datos de entrada", help: "Datos que el programa recibe para este paso." },
  { key: "condition", label: "Condición", help: "Pregunta en lenguaje natural que debe validar el programa." },
  { key: "operation", label: "Operación", help: "Constrúyela referenciando datos y operadores." },
  { key: "result", label: "Dato resultante", help: "Dato producido tras realizar una operación." },
  { key: "purpose", label: "Propósito", help: "Para qué se utilizará el dato producido." },
  { key: "usedIn", label: "Actividad asociada", help: "Actividad donde se usará el dato producido." },
  { key: "comment", label: "Comentario", help: "Nota libre para anotar qué sigue (opcional)." },
  { key: "ifTrue", label: "Si se cumple", help: "Camino cuando la condición se cumple (decisiones)." },
  { key: "ifFalse", label: "Si no se cumple", help: "Camino cuando la condición no se cumple (decisiones)." },
];

// Construye los nodos editables de una fila. Los campos que no aplican en la fila
// (condición y ramas fuera de una decisión) devuelven null, para que cada vista
// decida cómo mostrarlos (la tabla pone "—"; las tarjetas los omiten).
export function buildRowFields(row, dataById, handlers, activities = [], producedIds = new Set()) {
  const field = (updater) => handlers.onFieldChange(row.id, updater);
  const structural = (updater) => handlers.onStructuralChange(row.id, updater);
  const isCondition = row.kind === "condition";
  const mentions = handlers.getDataMentions; // menú "/" para insertar referencias
  const inputEntries = row.inputIds.map((id) => dataById.get(id)).filter(Boolean);
  const resultEntry = row.resultId ? dataById.get(row.resultId) ?? null : null;
  const allData = [...dataById.values()].filter((entry) => entry.id !== row.resultId);
  const availableInputs = allData.filter((entry) => !row.inputIds.includes(entry.id));
  const resolveData = (id) => dataById.get(id) ?? null;
  const kindToggle = activityKindToggle(row.kind, (kind) => structural(() => ({ kind })));
  // Contexto de condiciones para COMPONER comprobaciones (C1 Y C2…) en una expresión.
  // Una condición no se compone a sí misma: se excluye la fila actual.
  const conditions = handlers.conditionEntries
    ? { entries: handlers.conditionEntries().filter((entry) => entry.id !== row.id), resolve: handlers.resolveCondition }
    : null;
  // Datos disponibles en el editor, en selects separados: resultados producidos por
  // otras actividades, y datos de entrada. Para una operación, las entradas son las
  // definidas para esa actividad (`inputIds`); una condición (sin esa zona) ofrece
  // todos los datos de entrada declarados.
  // Un dato producido pertenece a «Dato resultante», nunca a «Dato de entrada»,
  // aunque se haya referenciado como entrada de la actividad.
  const resultRefs = allData.filter((entry) => producedIds.has(entry.id));
  const inputRefs = (isCondition
    ? allData
    : row.inputIds.map((id) => dataById.get(id)).filter(Boolean)
  ).filter((entry) => !producedIds.has(entry.id));
  // Si no hay datos de entrada disponibles, una pista dice de dónde salen (para que
  // el selector no desaparezca sin explicación).
  const inputHint = inputRefs.length > 0
    ? null
    : isCondition
      ? "Declara datos en «Datos de entrada» para usarlos aquí"
      : "Agrega datos de entrada a esta actividad (arriba) para usarlos aquí";
  const exprCtx = { inputRefs, resultRefs, resolve: resolveData, producedIds, conditions, inputHint };
  const expression = (tokens, focusKey) =>
    expressionEditor(tokens, (updater) => handlers.onOperationChange(row.id, updater), focusKey, exprCtx);
  const branch = (key) => branchEditor(row[key], key, { structural, rowId: row.id, exprCtx, activities });

  // Una condición: pregunta + expresión + nombre, y decide si evaluarse ahora. Si
  // NO se evalúa, queda reutilizable (dónde se usará + comentario). Si SÍ se evalúa,
  // produce un dato lógico con propósito; como decisión, lleva sus caminos.
  if (isCondition) {
    const evaluated = row.evaluateNow;
    const isDecisionCondition = evaluated && row.purpose === "decision";
    const showUsedIn = !evaluated || row.purpose === "operation" || row.purpose === "decision";
    return {
      kind: kindToggle,
      conditionName: conditionNameField(row, field, handlers),
      condition: textField(row.condition, "¿Qué se comprueba?", (value) => field(() => ({ condition: value })), { normalize: formatAsQuestion, mentions }),
      operation: expression(row.operation, `op:${row.id}`),
      evaluate: evaluateToggle(row.evaluateNow, (value) => structural(() => ({ evaluateNow: value }))),
      result: evaluated ? logicalResultEditor(row.id, resultEntry, handlers) : null,
      purpose: evaluated ? purposeOptions(row.purpose, (value) => structural(() => ({ purpose: value }))) : null,
      usedIn: showUsedIn ? usedInSelect(row, activities, (value) => handlers.onUsedInChange(row.id, value)) : null,
      comment: commentField(row.subsequentUse, (value) => field(() => ({ subsequentUse: value })), mentions),
      ifTrue: isDecisionCondition ? branch("ifTrue") : null,
      ifFalse: isDecisionCondition ? branch("ifFalse") : null,
    };
  }

  // Una operación produce un dato: necesidad + expresión + dato resultante +
  // propósito (nueva operación o información final) + uso posterior + comentario.
  // No comprueba (las condiciones son su propia tarjeta) ni tiene caminos.
  return {
    kind: kindToggle,
    problem: textField(row.problem, "Necesidad de este paso", (value) => field(() => ({ problem: value })), { normalize: capitalizeFirst, mentions }),
    inputs: inputsEditor(row.id, inputEntries, availableInputs, producedIds, handlers),
    operation: expression(row.operation, `op:${row.id}`),
    result: resultEditor(row.id, resultEntry, handlers),
    purpose: purposeOptions(row.purpose, (value) => structural(() => ({ purpose: value }))),
    // La actividad asociada solo aplica cuando la fila produce un dato que reutilizar.
    usedIn: row.resultId ? usedInSelect(row, activities, (value) => handlers.onUsedInChange(row.id, value)) : null,
    comment: commentField(row.subsequentUse, (value) => field(() => ({ subsequentUse: value })), mentions),
  };
}

// Interruptor del tipo de actividad: operación (produce un dato) o condición
// (comprobación reutilizable). Cambia qué campos muestra la tarjeta.
function activityKindToggle(kind, onChange) {
  const button = (value, label, iconName) =>
    el(
      "button",
      {
        type: "button",
        class: `inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition ${
          kind === value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
        }`,
        onclick: () => kind !== value && onChange(value),
      },
      [icon(iconName, "h-3.5 w-3.5"), label],
    );
  const toggle = el("div", { class: "inline-flex rounded-md bg-slate-100 p-0.5" }, [
    button("operation", "Operación", "workflow"),
    button("condition", "Condición", "fork"),
  ]);
  // Micro-ayuda: recuerda qué es cada tipo, justo donde se elige.
  const hint = el(
    "p",
    { class: "mt-1 text-[11px] text-slate-400" },
    kind === "condition" ? "Comprueba algo: una pregunta de Sí / No." : "Calcula o transforma datos para obtener uno nuevo.",
  );
  return el("div", {}, [toggle, hint]);
}

// Campo de nombre de una condición. Aplica la convención de nombres al desenfocar;
// el placeholder muestra la etiqueta genérica que recibiría si se deja vacío.
function conditionNameField(row, field, handlers) {
  const input = el("input", {
    type: "text",
    value: row.conditionName ?? "",
    placeholder: handlers.conditionPlaceholder ? handlers.conditionPlaceholder(row.id) : "C1",
    class: CONTROL_CLASS,
    dataset: { focusKey: `cond-name:${row.id}` },
    oninput: (event) => field(() => ({ conditionName: event.target.value })),
    onblur: (event) => normalizeFieldOnBlur(event, handlers.formatName, (name) => field(() => ({ conditionName: name }))),
  });
  return input;
}

// Lista de actividades con una etiqueta reconocible (posición + dato/necesidad),
// para poblar el selector de "actividad asociada". El id es la clave estable.
export function buildActivityList(rows, dataById) {
  return rows.map((row, index) => {
    const detail = dataById.get(row.resultId)?.name || row.problem || "";
    const label = detail ? `Actividad ${index + 1} · ${detail}` : `Actividad ${index + 1}`;
    return { id: row.id, label };
  });
}

// Marcador discreto para un campo que no aplica en esta actividad.
export function notApplicable() {
  return el("span", { class: "block px-2 py-1 text-xs text-slate-300", title: "No aplica en esta actividad" }, "—");
}

// Re-renderiza preservando el control enfocado, la posición del cursor y el scroll,
// para que al crear un dato o agregarlo a una expresión se refresque la vista sin
// interrumpir la escritura ni saltar a otra actividad. Conserva el scroll de la
// ventana y el de los contenedores marcados con `data-scroll-key` (p. ej. la tira
// horizontal de tarjetas), que al recrearse volverían a su inicio. `render`
// re-dibuja dentro de `container`.
export function renderPreservingFocus(container, render) {
  const active = document.activeElement;
  const focusKey = active?.dataset?.focusKey;
  const start = active?.selectionStart ?? null;
  const end = active?.selectionEnd ?? null;

  const pageX = window.scrollX;
  const pageY = window.scrollY;
  const scrolls = new Map();
  container.querySelectorAll("[data-scroll-key]").forEach((node) => {
    scrolls.set(node.dataset.scrollKey, { left: node.scrollLeft, top: node.scrollTop });
  });

  render();

  container.querySelectorAll("[data-scroll-key]").forEach((node) => {
    const saved = scrolls.get(node.dataset.scrollKey);
    if (saved) {
      node.scrollLeft = saved.left;
      node.scrollTop = saved.top;
    }
  });

  if (focusKey) {
    const restored = container.querySelector(`[data-focus-key="${focusKey}"]`);
    if (restored) {
      // preventScroll: el scroll ya se restauró; que el foco no lo vuelva a mover.
      restored.focus({ preventScroll: true });
      if (start != null && typeof restored.setSelectionRange === "function") {
        try {
          restored.setSelectionRange(start, end);
        } catch {
          // Algunos tipos de input no admiten setSelectionRange; el foco basta.
        }
      }
    }
  }

  window.scrollTo(pageX, pageY);
}

// Selector para alternar entre la vista de tabla y la de tarjetas.
export function viewToggle(mode, onToggle) {
  const button = (key, label) =>
    el(
      "button",
      {
        type: "button",
        class: `rounded px-3 py-1 text-sm font-medium transition ${mode === key ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`,
        onclick: () => mode !== key && onToggle(key),
      },
      label,
    );
  return el("div", { class: "inline-flex rounded-md bg-slate-100 p-0.5" }, [button("table", "Tabla"), button("cards", "Tarjetas")]);
}

// Tirador de arrastre. La identidad viaja por el id de la actividad; `setDragged`
// registra (o limpia) la actividad que se está arrastrando en la vista. Marca el
// elemento arrastrado (atenuado) para que sea identificable durante el arrastre.
export function dragHandle(rowId, setDragged) {
  return el(
    "span",
    {
      class: "block cursor-grab select-none rounded px-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing",
      title: "Arrastra para reordenar esta actividad",
      draggable: "true",
      "aria-label": "Reordenar actividad",
      ondragstart: (event) => {
        setDragged(rowId);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", rowId);
        }
        event.currentTarget.closest("[data-row-id]")?.classList.add("is-dragging");
      },
      ondragend: (event) => {
        setDragged(null);
        event.currentTarget.closest("[data-row-id]")?.classList.remove("is-dragging");
        // Limpia cualquier resaltado de destino que quedara si no hubo "drop".
        document.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
      },
    },
    "⠿",
  );
}

// Resalta (o limpia) un elemento como posible destino del arrastre. Se usa en los
// eventos dragover/dragleave/drop de las filas y tarjetas.
export function markDropTarget(element) {
  element.classList.add("is-drop-target");
}

export function clearDropTarget(element) {
  element.classList.remove("is-drop-target");
}

// Pasa la actividad a modo edición (mostrada en el modo de visualización).
export function editButton(onClick) {
  return el(
    "button",
    {
      type: "button",
      class: "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[oklch(0.90_0.04_300)] hover:text-[var(--lx-violet)]",
      title: "Editar esta actividad",
      onclick: onClick,
    },
    [icon("edit", "h-3.5 w-3.5"), "Editar"],
  );
}

// Finaliza la edición y devuelve la actividad al modo de visualización.
export function doneButton(onClick) {
  return el(
    "button",
    {
      type: "button",
      class: "inline-flex items-center gap-1 rounded-md bg-[var(--lx-violet)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--lx-violet-hover)]",
      title: "Terminar de editar",
      onclick: onClick,
    },
    [icon("check", "h-3.5 w-3.5"), "Listo"],
  );
}

export function deleteButton(onClick) {
  return el(
    "button",
    {
      type: "button",
      class: "inline-flex h-8 w-8 items-center justify-center rounded-[var(--lx-r-control)] text-[var(--lx-ink-muted)] hover:bg-[oklch(0.96_0.02_25)] hover:text-[oklch(0.55_0.15_25)]",
      title: "Eliminar actividad",
      "aria-label": "Eliminar actividad",
      onclick: onClick,
    },
    "✕",
  );
}

// Dos botones punteados para agregar un paso: operación (hover violeta) o condición
// (hover ámbar). Apilados, ocupan el ancho del riel de la etapa Construcción.
export function addActivityButton(onAddRow) {
  const button = (kind, label, squareCls, hover) =>
    el(
      "button",
      {
        type: "button",
        class: `inline-flex w-full items-center gap-2 rounded-[var(--lx-r-control)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-2.5 py-2 text-[13.5px] font-medium text-[var(--lx-ink-body)] ${hover}`,
        onclick: () => onAddRow(kind),
      },
      [el("span", { class: `flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[13px] font-semibold ${squareCls}` }, "+"), label],
    );
  return el("div", { class: "flex flex-col gap-2" }, [
    button("operation", "Agregar operación", "bg-[var(--lx-entrada-bg)] text-[var(--lx-violet)]", "hover:border-[var(--lx-violet)]"),
    button("condition", "Agregar condición", "bg-[var(--lx-condicion-bg)] text-[var(--lx-condicion-fg)]", "hover:border-[var(--lx-condicion-fg)]"),
  ]);
}

// --- Constructores de controles ---

// Reformatea un campo al desenfocar aplicando `transform`, y persiste el resultado
// si cambió. Se usa para normalizar la presentación (capitalización, pregunta) y
// para aplicar la convención de nombres, sin interrumpir mientras se escribe.
export function normalizeFieldOnBlur(event, transform, persist) {
  if (typeof transform !== "function") return;
  const formatted = transform(event.target.value);
  if (formatted !== event.target.value) {
    event.target.value = formatted;
    persist(formatted);
  }
}

// `normalize` corrige la forma del texto al desenfocar (no mientras se escribe,
// para no interrumpir). `mentions` activa el menú de datos al escribir "/".
function textField(value, placeholder, onInput, { normalize, mentions } = {}) {
  const field = el("textarea", {
    rows: 2,
    value: value ?? "",
    placeholder,
    class: `${CONTROL_CLASS} resize-y`,
    oninput: (event) => onInput(event.target.value),
    onblur: normalize ? (event) => normalizeFieldOnBlur(event, normalize, onInput) : null,
  });
  if (mentions) attachMentions(field, mentions);
  return field;
}

// Comentario como acción secundaria: colapsado tras «+ Agregar comentario» para no
// competir con lo esencial. Se abre si ya hay texto (o al pulsarlo).
function commentField(value, onInput, mentions) {
  const hasText = Boolean((value ?? "").trim());
  const details = el("details", {}, [
    el("summary", { class: "inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600" }, [
      icon("message", "h-3.5 w-3.5"),
      hasText ? "Comentario" : "+ Agregar comentario",
    ]),
    el("div", { class: "mt-1" }, [textField(value, "Comentario…", onInput, { mentions })]),
  ]);
  if (hasText) details.open = true;
  return details;
}

function selectField(options, value, onChange, { placeholder, className = CONTROL_CLASS } = {}) {
  const optionNodes = placeholder != null ? [el("option", { value: "" }, placeholder)] : [];
  for (const option of options) {
    optionNodes.push(el("option", { value: option.value }, option.label));
  }
  const select = el("select", { class: className, onchange: (event) => onChange(event.target.value) }, optionNodes);
  select.value = value ?? "";
  return select;
}

// Selector de tipo con aspecto de ficha (chip): el tipo elegido se lee como una
// pastilla discreta —igual que `typeChip`— pero sigue siendo editable.
const TYPE_CHIP_SELECT =
  "inline-flex w-auto max-w-full cursor-pointer rounded-[5px] border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] px-1.5 py-1 text-[11px] font-medium uppercase tracking-[0.03em] text-[var(--lx-ink-muted)] " +
  "outline-none hover:border-[var(--lx-entrada-border)] focus:border-[var(--lx-violet)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)]";

// Categoría de «agregar» que cada constructor tiene abierta, por `focusKey`. Es
// estado efímero de la vista (no del modelo): sobrevive al re-render que conserva
// el foco, para que tras agregar un elemento el panel siga en la misma categoría.
// null = plegado (solo se ve «+ Agregar elemento»).
const OPEN_CATEGORY = new Map();

// Categoría abierta del selector de datos de entrada de cada fila (por rowId): mismo
// estado efímero de vista que OPEN_CATEGORY. null/ausente = plegado.
const OPEN_INPUT_PICKER = new Map();

// Constructor visual de una expresión: fichas de tokens (dato/operador/valor) que
// se agregan, borran y reordenan. Se muestra sobre todo la expresión y un claro
// «+ Agregar elemento»; al abrirlo aparecen las categorías (dato de entrada, dato
// resultante, condición, valor, operador) y solo el control de la elegida, para no
// mostrar todas las herramientas a la vez.
// `focusKey` conserva el foco del campo de valor al re-renderizar (encadenar) y
// distingue el panel abierto de cada constructor.
// `ctx` = { inputRefs, resultRefs, resolve, producedIds, conditions }.
export function expressionEditor(tokens, onChange, focusKey = "expr", ctx = {}) {
  const { inputRefs = [], resultRefs = [], resolve = () => null, producedIds = new Set(), conditions = null, inputHint = null } = ctx;
  const conditionEntries = conditions?.entries ?? [];
  const resolveCondition = conditions?.resolve ?? null;
  const append = (token) => onChange((current) => [...current, token]);
  const removeAt = (index) => onChange((current) => current.filter((_, i) => i !== index));
  const removeLast = () => onChange((current) => current.slice(0, -1));

  let draggedIndex = null;
  const moveToken = (from, to) => {
    if (from == null || from === to) return;
    onChange((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const chips = tokens.map((token, index) =>
    operationTokenChip(token, resolve, producedIds, resolveCondition, {
      onRemove: () => removeAt(index),
      draggable: tokens.length > 1,
      onDragStart: () => {
        draggedIndex = index;
      },
      onDrop: () => {
        const from = draggedIndex;
        draggedIndex = null;
        moveToken(from, index);
      },
    }),
  );

  // Elementos disponibles como fichas dentro de la caja: se ve de una vez qué hay
  // y al pulsar uno se incorpora como referencia. `items` = [{id, label, type?}].
  // Cada ficha usa el color de su tipo (entrada azul, resultado verde, condición
  // naranja), el mismo que tendrá luego en la expresión. Vacío → una pista.
  const refChips = (items, makeToken, chipClass, iconName, emptyHint) => {
    const named = items.filter((entry) => (entry.label ?? "").trim());
    if (named.length === 0) {
      return el("p", { class: "text-[11px] italic text-slate-400" }, emptyHint ?? "Aún no hay disponibles.");
    }
    return el("div", { class: "flex flex-wrap gap-1" }, named.map((entry) =>
      el(
        "button",
        {
          type: "button",
          dataset: { exprAdd: entry.label },
          title: entry.label,
          class: `inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${chipClass}`,
          onmousedown: (event) => event.preventDefault(),
          onclick: () => append(makeToken(entry.id)),
        },
        [icon(iconName, "h-3 w-3 shrink-0"), el("span", { class: "min-w-0 truncate" }, entry.label), typeChip(entry.type)],
      ),
    ));
  };
  const hasNamed = (items) => items.some((entry) => (entry.label ?? entry.name ?? "").trim());
  const inputChips = refChips(
    inputRefs.map((e) => ({ id: e.id, label: e.name, type: e.type })),
    (id) => ({ kind: "ref", dataId: id }),
    "border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)] text-[var(--lx-entrada-fg)] hover:brightness-95",
    "data",
    inputHint,
  );
  const resultChips = refChips(
    resultRefs.map((e) => ({ id: e.id, label: e.name, type: e.type })),
    (id) => ({ kind: "ref", dataId: id }),
    "border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)] hover:brightness-95",
    "reuse",
    "Aún no hay datos producidos por otras actividades.",
  );
  const conditionChips = refChips(
    conditionEntries,
    (id) => ({ kind: "cond", condId: id }),
    "border-[var(--lx-condicion-border)] bg-[var(--lx-condicion-bg)] text-[var(--lx-condicion-fg)] hover:brightness-95",
    "fork",
    "Aún no hay otras condiciones reutilizables.",
  );

  // Campo independiente para agregar un valor constante (literal).
  const addValue = () => {
    const value = valueInput.value.trim();
    if (!value) return;
    valueInput.value = "";
    append({ kind: "literal", value });
  };
  const valueInput = el("input", {
    type: "text",
    placeholder: "valor",
    autocomplete: "off",
    class: `${CONTROL_CLASS} min-w-0 flex-1 text-xs`,
    dataset: { focusKey: `expr:${focusKey}` },
    onkeydown: (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addValue();
      } else if (event.key === "Backspace" && valueInput.value === "" && tokens.length > 0) {
        event.preventDefault();
        removeLast();
      }
    },
  });
  const valueButton = el(
    "button",
    {
      type: "button",
      class: "shrink-0 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:border-[oklch(0.90_0.04_300)] hover:text-[var(--lx-violet)]",
      title: "Agregar valor",
      onmousedown: (event) => event.preventDefault(),
      onclick: addValue,
    },
    "+ valor",
  );

  const operatorGroups = Object.values(OPERATOR_GROUPS).map((group) => operatorGroup(group, (key) => append({ kind: "op", op: key })));

  // Control de cada categoría, revelado solo cuando esa categoría está activa.
  const valuePanel = el("div", { class: "space-y-1" }, [
    el("div", { class: "flex items-center gap-1" }, [valueInput, valueButton]),
    el("p", { class: "text-[11px] leading-snug text-slate-400" }, "Un valor puede ser un número (3), un texto («Aprueba»), etc."),
  ]);
  const operatorPanel = el("div", { class: "flex flex-col gap-1.5" }, operatorGroups);

  // Categorías de «agregar», claramente diferenciadas. Solo aparecen las que
  // aplican: el dato resultante o la condición se ofrecen si hay alguno reutilizable.
  const categories = [
    { key: "input", label: "Dato de entrada", icon: "data", tone: "text-[var(--lx-entrada-fg)]", help: "Los que declaraste en el paso Datos.", control: inputChips },
    hasNamed(resultRefs) ? { key: "result", label: "Dato resultante", icon: "reuse", tone: "text-[var(--lx-resultante-fg)]", help: "Los que produjo otra actividad.", control: resultChips } : null,
    hasNamed(conditionEntries) ? { key: "condition", label: "Condición", icon: "fork", tone: "text-[var(--lx-condicion-fg)]", help: "El resultado de una comprobación anterior.", control: conditionChips } : null,
    { key: "value", label: "Valor fijo", icon: "hash", tone: "text-slate-400", help: "Un número o texto que escribes tú.", control: valuePanel },
    { key: "operator", label: "Operador", icon: "workflow", tone: "text-slate-400", help: "Qué relación hay entre los elementos.", control: operatorPanel },
  ].filter(Boolean);

  // Arriba: la expresión que se está construyendo (o una pista si está vacía).
  // Sin título: el encabezado de la zona («Qué haces») ya la nombra.
  const expressionBox = el("div", { class: "rounded-[12px] border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] px-3 py-2.5" }, [
    tokens.length > 0
      ? el("div", { class: "flex flex-wrap items-center gap-1.5" }, chips)
      : el("p", { class: "text-[13px] italic text-[var(--lx-ink-muted)]" }, "Aún vacía: agrega datos, condiciones, valores y operadores."),
  ]);

  // Zona de «agregar», progresiva: plegada muestra solo el disparador; abierta,
  // las categorías y el control de la activa. El estado vive en OPEN_CATEGORY para
  // sobrevivir al re-render (así se pueden encadenar varios elementos seguidos).
  // El selector es un PANEL EMERGENTE bajo el botón: no empuja el contenido y se
  // queda abierto para agregar varios elementos. El estado vive en OPEN_CATEGORY
  // para sobrevivir al re-render.
  const adder = el("div", { class: "relative min-w-0" });
  const setCategory = (value) => {
    if (value == null) OPEN_CATEGORY.delete(focusKey);
    else OPEN_CATEGORY.set(focusKey, value);
    paintAdder();
  };
  const paintAdder = () => {
    clear(adder);
    const active = OPEN_CATEGORY.get(focusKey) ?? null;
    adder.append(addTrigger(() => setCategory(active == null ? categories[0].key : null), "+ elemento", active != null));
    if (active == null) return;
    const current = categories.find((category) => category.key === active) ?? categories[0];
    adder.append(
      el("div", { class: "absolute left-0 top-full z-20 mt-1 w-full min-w-[280px] space-y-2 rounded-[13px] border border-[oklch(0.85_0.06_300)] bg-[var(--lx-surface)] p-3 shadow-[var(--lx-shadow-pop)]" }, [
        el("p", { class: "text-[12.5px] font-medium text-[var(--lx-ink-body)]" }, "¿Qué agregas a la expresión?"),
        el("div", { class: "flex flex-wrap items-center gap-1.5" }, categories.map((category) => categoryChip(category, category.key === current.key, () => setCategory(category.key)))),
        el("p", { class: "text-[11.5px] text-[var(--lx-ink-muted)]" }, current.help ?? ""),
        el("div", { class: "min-w-0" }, [current.control]),
        el("div", { class: "flex items-center justify-between gap-2 border-t border-[var(--lx-border-soft)] pt-2" }, [
          el("p", { class: "text-[11px] text-[var(--lx-ink-ghost)]" }, "Agrega los elementos en el orden en que se leen."),
          selectorDone(() => setCategory(null)),
        ]),
      ]),
    );
    // Al elegir «valor», el foco va al campo para escribir de inmediato.
    if (current.key === "value") valueInput.focus({ preventScroll: true });
  };
  paintAdder();

  return el("div", { class: "min-w-0 space-y-2", dataset: { exprBuilder: focusKey } }, [expressionBox, adder]);
}

// Disparador plegado de un selector progresivo: invita a agregar el primer/siguiente
// elemento. Se reutiliza en el constructor de expresiones y en los datos de entrada.
function addTrigger(onOpen, label = "+ Agregar elemento", isOpen = false) {
  return el(
    "button",
    {
      type: "button",
      "aria-expanded": String(isOpen),
      class: `flex w-full items-center justify-center gap-1.5 rounded-[var(--lx-r-control)] border border-dashed px-2 py-1.5 text-xs font-medium ${
        isOpen
          ? "border-[oklch(0.85_0.06_300)] bg-[oklch(0.972_0.018_300)] text-[var(--lx-violet)]"
          : "border-[var(--lx-border-dashed)] text-[var(--lx-ink-muted)] hover:border-[oklch(0.90_0.04_300)] hover:bg-[oklch(0.972_0.018_300)] hover:text-[var(--lx-violet)]"
      }`,
      onclick: onOpen,
    },
    [icon("data", "h-3.5 w-3.5"), label],
  );
}

// Ficha de una categoría de «agregar»: resaltada cuando es la activa.
function categoryChip(category, selected, onSelect) {
  return el(
    "button",
    {
      type: "button",
      "aria-pressed": String(selected),
      class: `inline-flex items-center rounded-[var(--lx-r-control)] border px-2.5 py-1 text-[12.5px] transition ${
        selected ? "border-[oklch(0.85_0.06_300)] bg-[oklch(0.972_0.018_300)] font-medium text-[var(--lx-violet)]" : "border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-muted)] hover:border-[oklch(0.90_0.04_300)] hover:text-[var(--lx-ink-body)]"
      }`,
      onclick: onSelect,
    },
    el("span", {}, category.label),
  );
}

// Botón «Listo» del pie del selector: cierra el panel emergente (acción primaria).
function selectorDone(onDone) {
  return el(
    "button",
    { type: "button", class: "inline-flex shrink-0 items-center rounded-[var(--lx-r-control)] bg-[var(--lx-violet)] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--lx-violet-hover)]", onclick: onDone },
    "Listo",
  );
}

// Un grupo de operadores (aritméticos, relacionales…) como caja rotulada con
// botones amplios, para que sean claros y fáciles de pulsar.
// Un grupo de operadores como una fila compacta: etiqueta a la izquierda y sus
// símbolos a la derecha. Apiladas, las cuatro filas caben en el panel sin que se
// corten los grupos inferiores (antes se recortaban al desbordar el emergente).
function operatorGroup(group, onPick) {
  return el("div", { class: "flex items-start gap-2" }, [
    el("span", { class: "w-[68px] shrink-0 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--lx-ink-muted)]" }, group.label),
    el(
      "div",
      { class: "flex flex-wrap gap-1" },
      Object.entries(group.operators).map(([key, symbol]) =>
        el(
          "button",
          {
            type: "button",
            title: `${group.label}: ${symbol}`,
            dataset: { op: key },
            class: "inline-flex h-7 min-w-[1.85rem] items-center justify-center rounded-[6px] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-1.5 text-[13px] font-semibold [font-family:var(--lx-font-mono)] text-[var(--lx-ink-body)] hover:border-[var(--lx-violet)] hover:bg-[var(--lx-entrada-bg)] hover:text-[var(--lx-violet)]",
            onmousedown: (event) => event.preventDefault(),
            onclick: () => onPick(key),
          },
          symbol,
        ),
      ),
    ),
  ]);
}

function operationTokenChip(token, resolve, producedIds, resolveCondition, { onRemove, draggable, onDragStart, onDrop }) {
  const { leading, text, className, extra = "" } = describeToken(token, resolve, producedIds, resolveCondition);
  const cursor = draggable ? "cursor-move" : "";
  const isOp = token.kind === "op";
  return el(
    "span",
    {
      class: `group inline-flex max-w-full min-w-0 items-center gap-1 rounded-[6px] text-[13px] [font-family:var(--lx-font-mono)] ${isOp ? "px-1" : "px-2 py-[3px]"} ${extra} ${cursor} ${className}`,
      draggable: draggable ? "true" : null,
      title: draggable ? "Arrastra para reordenar" : null,
      ondragstart: onDragStart,
      ondragover: (event) => draggable && event.preventDefault(),
      ondrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop();
      },
    },
    [
      leading,
      // break-words: un valor largo se ajusta dentro de la tarjeta en vez de desbordar.
      el("span", { class: "min-w-0 break-words" }, text),
      // La × aparece al pasar el cursor, para que la expresión se lea limpia.
      el("button", { type: "button", class: "-mr-0.5 opacity-0 transition group-hover:opacity-100 text-[var(--lx-ink-muted)] hover:text-[oklch(0.55_0.15_25)]", title: "Quitar", onclick: onRemove }, "×"),
    ],
  );
}

// Describe una ficha por tipo. Cada tipo se distingue por FORMA además del color:
// dato de entrada = icono de datos (azul); resultado producido por otra actividad
// = icono de reutilización (verde); condición = icono de bifurcación (naranja);
// operador = símbolo monoespaciado en negrita; valor = «#» (gris).
function describeToken(token, resolve, producedIds = new Set(), resolveCondition = null) {
  if (token.kind === "cond") {
    const condition = resolveCondition ? resolveCondition(token.condId) : null;
    return {
      leading: icon("fork", "h-3 w-3 shrink-0 text-[var(--lx-condicion-fg)]"),
      text: condition ? condition.label : "(condición eliminada)",
      className: "border border-[var(--lx-condicion-border)] bg-[var(--lx-condicion-bg)] text-[var(--lx-condicion-fg)]",
      extra: "font-semibold",
    };
  }
  if (token.kind === "ref") {
    const datum = resolve(token.dataId);
    const text = datum ? datum.name || "(sin nombre)" : "(dato eliminado)";
    if (producedIds.has(token.dataId)) {
      return {
        leading: icon("reuse", "h-3 w-3 shrink-0 text-[var(--lx-resultante-fg)]"),
        text,
        className: "border border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)]",
      };
    }
    return {
      leading: icon("data", "h-3 w-3 shrink-0 text-[var(--lx-entrada-fg)]"),
      text,
      className: "border border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)] text-[var(--lx-entrada-fg)]",
    };
  }
  if (token.kind === "op") {
    // Los operadores van sin fondo (solo el símbolo), para que resalten los datos.
    return { leading: null, text: OPERATOR_SYMBOLS[token.op] ?? "?", className: "text-[var(--lx-ink-body)]", extra: "font-semibold" };
  }
  return {
    leading: icon("hash", "h-3 w-3 shrink-0 text-slate-400"),
    text: token.value || "∅",
    className: "border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] text-[var(--lx-ink-muted)]",
    extra: "font-mono",
  };
}

function resultEditor(rowId, result, handlers) {
  const typeSelect = selectField(optionsOf(DATA_TYPES), result?.type, (value) => handlers.onResultChange(rowId, { type: value }), {
    placeholder: "Tipo…",
    className: TYPE_CHIP_SELECT,
  });
  typeSelect.dataset.focusKey = `res-type:${rowId}`;

  // El dato producido en un panel violeta destacado: nombre en monoespaciada grande.
  return el("div", { class: "space-y-2 rounded-[var(--lx-r-panel)] border border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)]/50 p-3" }, [
    el("input", {
      type: "text",
      value: result?.name ?? "",
      placeholder: "nombre del dato",
      class: "w-full border-0 bg-transparent p-0 [font-family:var(--lx-font-mono)] text-[15px] font-medium text-[var(--lx-entrada-fg)] outline-none placeholder:text-[var(--lx-ink-ghost)] focus:ring-0",
      dataset: { focusKey: `res-name:${rowId}` },
      oninput: (event) => handlers.onResultChange(rowId, { name: event.target.value }),
      // Al desenfocar, el nombre del dato resultante adopta la convención vigente.
      onblur: (event) => normalizeFieldOnBlur(event, handlers.formatName, (name) => handlers.onResultChange(rowId, { name })),
    }),
    typeSelect,
  ]);
}

// Propósito del dato resultante (qué le ocurrirá después) como control segmentado:
// tres destinos en un grupo; el elegido se eleva sobre el fondo hundido.
function purposeOptions(purpose, onChange) {
  const option = (value, iconName) => {
    const selected = purpose === value;
    return el(
      "button",
      {
        type: "button",
        "aria-pressed": String(selected),
        dataset: { purpose: value },
        class: `inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-2 text-center text-[13px] transition ${
          selected ? "bg-[var(--lx-surface)] font-medium text-[var(--lx-ink)] shadow-[var(--lx-shadow-card)]" : "text-[var(--lx-ink-muted)] hover:text-[var(--lx-ink-body)]"
        }`,
        onclick: () => onChange(value),
      },
      [icon(iconName, "h-3.5 w-3.5 shrink-0"), el("span", {}, labelOf(PURPOSES, value))],
    );
  };
  return el("div", { class: "flex flex-wrap gap-1 rounded-[var(--lx-r-field)] border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] p-1" }, [
    option("operation", "workflow"),
    option("decision", "fork"),
    option("response", "flag"),
  ]);
}

// Interruptor de una condición: ¿evaluarla ahora (produce un dato lógico) o
// dejarla reutilizable para más adelante? Cambia los campos que muestra la tarjeta.
function evaluateToggle(checked, onChange) {
  const box = el("input", { type: "checkbox", class: "h-3.5 w-3.5 rounded border-slate-300 text-[var(--lx-violet)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)]" });
  box.checked = Boolean(checked);
  box.onchange = (event) => onChange(event.target.checked);
  const label = el("label", { class: "inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800" }, [
    box,
    el("span", {}, "Evaluarla ahora (produce un dato lógico)"),
  ]);
  const hint = el(
    "p",
    { class: "mt-0.5 text-[11px] text-slate-400" },
    checked ? "Produce un dato lógico; elige su propósito abajo." : "Sin evaluar: queda reutilizable para combinarla con otras condiciones.",
  );
  return el("div", {}, [label, hint]);
}

// Dato resultante de una condición evaluada: solo el nombre; el tipo es lógico
// automáticamente (se muestra como distintivo, no editable).
function logicalResultEditor(rowId, result, handlers) {
  return el("div", { class: "flex items-center gap-2" }, [
    el("input", {
      type: "text",
      value: result?.name ?? "",
      placeholder: "nombre del dato lógico",
      class: `${CONTROL_CLASS} flex-1`,
      dataset: { focusKey: `res-name:${rowId}` },
      oninput: (event) => handlers.onResultChange(rowId, { name: event.target.value, type: "logical" }),
      onblur: (event) => normalizeFieldOnBlur(event, handlers.formatName, (name) => handlers.onResultChange(rowId, { name, type: "logical" })),
    }),
    typeBadge("logical"),
  ]);
}

// Selector de una actividad destino: las otras actividades más "Pendiente" para
// cuando la actividad aún no existe. Lo comparten el uso del dato producido y los
// caminos de una decisión.
function activitySelect(currentId, activities, excludeId, onChange, placeholder) {
  const others = activities.filter((activity) => activity.id !== excludeId);
  const options = [
    { value: PENDING_ACTIVITY, label: "Pendiente de asignación" },
    ...others.map((activity) => ({ value: activity.id, label: activity.label })),
  ];
  return selectField(options, currentId, onChange, { placeholder });
}

// Selector de la actividad donde se usará el dato producido.
function usedInSelect(row, activities, onChange) {
  return activitySelect(row.usedInRowId, activities, row.id, onChange, "— Sin asignar —");
}

// Camino de una decisión: si es una respuesta, el constructor de la respuesta; si
// continúa (nueva operación / otra decisión), la actividad concreta en la que sigue.
function branchEditor(branch, key, { structural, rowId, exprCtx, activities = [] }) {
  const setBranch = (changes) => structural((row) => ({ [key]: { ...row[key], ...changes } }));
  const children = [
    selectField(optionsOf(BRANCH_TYPES), branch.type, (value) => setBranch({ type: value }), {
      placeholder: "Continúa con…",
    }),
  ];
  if (branch.type === "response") {
    children.push(
      expressionEditor(
        branch.value,
        (updater) => structural((row) => ({ [key]: { ...row[key], value: updater(row[key].value) } })),
        `br:${rowId}:${key}`,
        exprCtx,
      ),
    );
  } else if (branch.type === "operation" || branch.type === "decision") {
    children.push(
      el("div", { class: "flex flex-wrap items-center gap-2 text-[13px]" }, [
        el("span", { class: "shrink-0 text-[var(--lx-ink-muted)]" }, "Sigue en"),
        el("div", { class: "min-w-0 flex-1" }, [
          activitySelect(branch.targetRowId, activities, rowId, (value) => setBranch({ targetRowId: value }), "— Elige actividad —"),
        ]),
      ]),
    );
  }
  return el("div", { class: "space-y-1.5" }, children);
}

// Tipo de un dato como ficha (chip) discreta a la derecha del nombre
// (Numérico/Lógico/Texto). Es solo lectura: distingue el tipo sin editarlo.
function typeChip(type) {
  return type
    ? el("span", { class: "shrink-0 rounded-[5px] border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.03em] text-[var(--lx-ink-muted)]" }, labelOf(DATA_TYPES, type))
    : null;
}

// Datos de entrada de la fila: solo se reutilizan. Fichas de solo lectura de los ya
// referenciados + un «+ Agregar dato» progresivo que, al abrirse, muestra los datos
// disponibles (de entrada y resultantes) como fichas, con el mismo mecanismo que el
// constructor de expresiones.
function inputsEditor(rowId, entries, availableInputs, producedIds, handlers) {
  const chips = entries.map((entry) =>
    el("div", { class: "group flex items-center gap-2 rounded-[var(--lx-r-control)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-2.5 py-1.5", title: "Se edita en la sección «Datos de entrada»" }, [
      el("span", { class: "[font-family:var(--lx-font-mono)] min-w-0 flex-1 truncate text-[13px] text-[var(--lx-ink-body)]" }, entry.name || "(sin nombre)"),
      typeChip(entry.type),
      el("button", {
        type: "button",
        class: "shrink-0 rounded px-1 text-[var(--lx-ink-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[oklch(0.55_0.15_25)]",
        title: "Quitar referencia",
        onclick: () => handlers.onRemoveRowInput(rowId, entry.id),
      }, "×"),
    ]),
  );

  if (availableInputs.length === 0) {
    if (chips.length === 0) chips.push(el("span", { class: "text-xs text-slate-300" }, "Declara datos arriba"));
    return el("div", { class: "space-y-1" }, chips);
  }

  // Ficha para reutilizar un dato: entrada (azul) o resultado producido (verde),
  // el mismo lenguaje de color que en la expresión.
  const dataChipButton = (entry) => {
    const produced = producedIds.has(entry.id);
    return el(
      "button",
      {
        type: "button",
        dataset: { addInput: entry.id },
        title: entry.name || "(sin nombre)",
        class: `inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${
          produced ? "border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)] hover:brightness-95" : "border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)] text-[var(--lx-entrada-fg)] hover:brightness-95"
        }`,
        onmousedown: (event) => event.preventDefault(),
        onclick: () => handlers.onReuseInput(rowId, entry.id),
      },
      [icon(produced ? "reuse" : "data", "h-3 w-3 shrink-0"), el("span", { class: "min-w-0 truncate" }, entry.name || "(sin nombre)"), typeChip(entry.type)],
    );
  };
  const chipWrap = (items) => el("div", { class: "flex flex-wrap gap-1" }, items.map(dataChipButton));

  const entradas = availableInputs.filter((entry) => !producedIds.has(entry.id));
  const resultantes = availableInputs.filter((entry) => producedIds.has(entry.id));

  // Mismo mecanismo progresivo que el constructor de expresiones: categorías
  // diferenciadas y solo las fichas de la activa (no todas a la vez).
  const categories = [
    entradas.length > 0 ? { key: "input", label: "Dato de entrada", icon: "data", tone: "text-[var(--lx-entrada-fg)]", help: "Los que declaraste en el paso Datos.", control: chipWrap(entradas) } : null,
    resultantes.length > 0 ? { key: "result", label: "Dato resultante", icon: "reuse", tone: "text-[var(--lx-resultante-fg)]", help: "Los que produjo otra actividad.", control: chipWrap(resultantes) } : null,
  ].filter(Boolean);

  // Mismo panel emergente que el selector de la expresión, para que ambos se sientan
  // igual: flota bajo el botón y se queda abierto para agregar varios datos.
  const picker = el("div", { class: "relative min-w-0" });
  const setCategory = (value) => {
    if (value == null) OPEN_INPUT_PICKER.delete(rowId);
    else OPEN_INPUT_PICKER.set(rowId, value);
    paint();
  };
  const paint = () => {
    clear(picker);
    const active = OPEN_INPUT_PICKER.get(rowId) ?? null;
    picker.append(addTrigger(() => setCategory(active == null ? categories[0].key : null), "+ Agregar dato", active != null));
    if (active == null) return;
    const current = categories.find((category) => category.key === active) ?? categories[0];
    picker.append(
      el("div", { class: "absolute left-0 top-full z-20 mt-1 w-full min-w-[260px] space-y-2 rounded-[13px] border border-[oklch(0.85_0.06_300)] bg-[var(--lx-surface)] p-3 shadow-[var(--lx-shadow-pop)]" }, [
        el("p", { class: "text-[12.5px] font-medium text-[var(--lx-ink-body)]" }, "¿De dónde sale el dato?"),
        el("div", { class: "flex flex-wrap items-center gap-1.5" }, categories.map((category) => categoryChip(category, category.key === current.key, () => setCategory(category.key)))),
        el("p", { class: "text-[11.5px] text-[var(--lx-ink-muted)]" }, current.help ?? ""),
        el("div", { class: "min-w-0" }, [current.control]),
        el("div", { class: "flex items-center justify-between gap-2 border-t border-[var(--lx-border-soft)] pt-2" }, [
          el("p", { class: "text-[11px] text-[var(--lx-ink-ghost)]" }, "Puedes agregar varios."),
          selectorDone(() => setCategory(null)),
        ]),
      ]),
    );
  };
  paint();

  return el("div", { class: "space-y-1" }, [...chips, picker]);
}
