// Primitivas de presentación para las tarjetas de actividad (vista de tarjetas y
// cadena del análisis). Dan a todas las tarjetas la MISMA jerarquía visual:
// un número de paso, zonas agrupadas con un título de color y filas etiquetadas.
// Solo se ocupa del DOM; no conoce el modelo.

import { el } from "../utils/dom.js";
import { icon } from "./icons.js";

// Tonos por zona (tokens del rediseño): entrada y proceso en violeta, resultado en
// verde, condición y decisión (sus caminos y propósito) en ámbar, y el contexto en
// gris. Cada zona lleva un icono para reconocerla rápido.
const ZONE_TONES = {
  need: { bar: "border-[var(--lx-border)]", title: "text-[var(--lx-ink-muted)]", icon: "target" },
  input: { bar: "border-[var(--lx-entrada-border)]", title: "text-[var(--lx-entrada-fg)]", icon: "data" },
  process: { bar: "border-[oklch(0.90_0.04_300)]", title: "text-[var(--lx-violet)]", icon: "workflow" },
  result: { bar: "border-[var(--lx-resultante-border)]", title: "text-[var(--lx-resultante-fg)]", icon: "flag" },
  branch: { bar: "border-[var(--lx-condicion-border)]", title: "text-[var(--lx-condicion-fg)]", icon: "fork" },
  purpose: { bar: "border-[var(--lx-condicion-border)]", title: "text-[var(--lx-condicion-fg)]", icon: "reuse" },
  condition: { bar: "border-[var(--lx-condicion-border)]", title: "text-[var(--lx-condicion-fg)]", icon: "fork" },
  reuse: { bar: "border-[var(--lx-resultante-border)]", title: "text-[var(--lx-resultante-fg)]", icon: "reuse" },
};

// Etiquetas de los campos que comparten zona con otros (para distinguirlos). Los
// campos que ocupan solos su zona no la necesitan: el título de la zona los nombra.
const SUBLABELS = { usedIn: "Se usa en" };

// Número del paso: distintivo redondo para reconocer la actividad de un vistazo.
export function stepNumber(position) {
  return el(
    "span",
    { class: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lx-entrada-bg)] text-xs font-semibold text-[var(--lx-entrada-fg)]" },
    String(position),
  );
}

// Caja para una nota de texto libre (comentario): entre comillas y en cursiva,
// visualmente diferenciada del resto de la información. `content` puede ser texto
// o nodos (p. ej. texto con referencias `[nombre]` resaltadas).
export function commentBox(content) {
  const inner = Array.isArray(content) ? content : [content];
  return el(
    "blockquote",
    { class: "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm italic leading-relaxed text-slate-600" },
    ["“", ...inner, "”"],
  );
}

// Caja para la condición: se lee como una pregunta (icono de interrogación + cursiva).
// `content` puede ser texto o nodos con referencias resaltadas.
export function questionBox(content) {
  return el("div", { class: "flex items-start gap-1.5 rounded-[var(--lx-r-panel)] border border-[var(--lx-condicion-border)] bg-[var(--lx-condicion-bg)] px-2.5 py-2 text-sm italic leading-relaxed text-[var(--lx-ink-body)]" }, [
    icon("help", "h-3.5 w-3.5 mt-1 text-[var(--lx-condicion-fg)]"),
    el("span", { class: "min-w-0 whitespace-pre-wrap" }, content),
  ]);
}

// Convierte un texto con referencias `[nombre]` en una lista de nodos: cada
// referencia que corresponde a un dato real se resalta como ficha (entrada = azul,
// resultado = verde); el resto queda como texto. `resolveName(name)` devuelve
// `{ produced }` si el nombre es un dato, o null. Así una referencia insertada con
// el menú «/» se lee como referencia y no como texto entre corchetes.
export function referencedText(text, resolveName) {
  const nodes = [];
  const pattern = /\[([^[\]]+)\]/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const info = typeof resolveName === "function" ? resolveName(match[1]) : null;
    nodes.push(info ? referenceChip(match[1], info.produced) : match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function referenceChip(name, produced) {
  return el(
    "span",
    {
      class: `inline-flex items-center gap-1 rounded-[var(--lx-r-chip)] px-1 py-0.5 align-middle not-italic ${produced ? "bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)]" : "bg-[var(--lx-entrada-bg)] text-[var(--lx-entrada-fg)]"}`,
    },
    [icon(produced ? "reuse" : "data", `h-3 w-3 ${produced ? "text-[var(--lx-resultante-fg)]" : "text-[var(--lx-entrada-fg)]"}`), el("span", {}, name)],
  );
}

// Caja para la operación: se lee como una fórmula (recuadro tenue, monoespaciada).
export function formulaBox(node) {
  return el("div", { class: "inline-flex max-w-full flex-wrap items-center gap-1 rounded-[var(--lx-r-panel)] border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] px-2 py-1 [font-family:var(--lx-font-mono)] text-sm text-[var(--lx-ink-body)]" }, [node]);
}

// Antepone un "=" al dato producido para enfatizar que es el resultado del paso.
export function withEquals(node) {
  return el("span", { class: "inline-flex items-center gap-1.5" }, [
    el("span", { class: "font-semibold text-slate-400" }, "="),
    node,
  ]);
}

// Antepone una flecha "→" a la acción de un camino de decisión, para que "entonces
// → [acción]" haga explícito que la condición determina el camino a seguir.
export function withArrow(node) {
  return el("span", { class: "inline-flex flex-wrap items-center gap-1.5" }, [
    el("span", { class: "font-semibold text-slate-400" }, "→"),
    node,
  ]);
}

// Fila etiqueta→valor en línea (compacta), para el modo de visualización.
export function inlineRow(label, value) {
  return el("div", { class: "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-slate-700" }, [
    label ? el("span", { class: "shrink-0 text-xs font-medium text-slate-400" }, label) : null,
    el("div", { class: "min-w-0" }, value),
  ]);
}

// Fila etiqueta arriba, control debajo (apilada), para el modo de edición.
export function stackedRow(label, value) {
  return el("div", {}, [
    label ? el("div", { class: "text-xs font-medium text-slate-500" }, label) : null,
    el("div", { class: label ? "mt-0.5" : "" }, value),
  ]);
}

// Ensambla las filas de una actividad en zonas con jerarquía consistente. El
// tipo (`kind`) decide qué zonas se muestran: una condición descubre una
// comprobación (menos campos) y una operación produce un dato.
// `nodesByKey` mapea cada clave de campo a un nodo ya construido (o null); las
// zonas sin contenido se omiten. `renderRow(label, value)` decide el estilo de
// fila (en línea o apilada) según la vista.
// Las zonas se titulan como PREGUNTAS orientadoras (¿qué necesitas? → ¿qué haces?
// → ¿qué obtienes? → ¿para qué?), para que la tarjeta se lea como el razonamiento
// del análisis. `asQuestions:false` usa títulos cortos (para la cadena, más compacta).
export function activityZones(nodesByKey, renderRow, kind = "operation", { asQuestions = true } = {}) {
  const row = (key, label = null) => (nodesByKey[key] ? renderRow(label, nodesByKey[key]) : null);
  const q = (question, short) => (asQuestions ? question : short);

  if (kind === "condition") {
    return [
      zoneBlock(q("¿Qué quieres comprobar?", "Condición"), ZONE_TONES.condition, [
        row("condition", "Pregunta"),
        row("operation", "Comprobación"),
        row("conditionName", "Nombre"),
        row("evaluate"),
      ]),
      // Solo presente si la condición se evalúa (result/purpose no nulos).
      zoneBlock(q("¿Qué obtienes?", "Resultado"), ZONE_TONES.result, [row("result", "Dato lógico")]),
      zoneBlock(q("¿Para qué lo usarás?", "Propósito"), ZONE_TONES.purpose, [row("purpose"), row("usedIn", SUBLABELS.usedIn)]),
      zoneBlock(q("¿Qué pasa según el resultado?", "Caminos"), ZONE_TONES.branch, [
        row("ifTrue", "Si se cumple, entonces:"),
        row("ifFalse", "Si no se cumple, entonces:"),
      ]),
      nodesByKey.comment ? el("div", { class: "pt-0.5" }, [nodesByKey.comment]) : null,
    ].filter(Boolean);
  }
  return [
    zoneBlock(q("¿Qué necesitas hacer?", "Necesidad"), ZONE_TONES.need, [row("problem")]),
    zoneBlock(q("¿Qué necesitas para hacerlo?", "Datos de entrada"), ZONE_TONES.input, [row("inputs")]),
    zoneBlock(q("¿Qué debes hacer?", "Operación"), ZONE_TONES.process, [row("operation")]),
    zoneBlock(q("¿Qué obtienes?", "Resultado"), ZONE_TONES.result, [row("result")]),
    zoneBlock(q("¿Para qué usarás este dato?", "Propósito"), ZONE_TONES.purpose, [row("purpose"), row("usedIn", SUBLABELS.usedIn)]),
    nodesByKey.comment ? el("div", { class: "pt-0.5" }, [nodesByKey.comment]) : null,
  ].filter(Boolean);
}

// Disposición HORIZONTAL de la actividad como flujo de razonamiento: agrupa las
// zonas en fases (Datos → Proceso → Resultado) que se leen de izquierda a derecha
// aprovechando el ancho, en vez de una columna alta que obliga a hacer scroll. En
// pantallas angostas las fases se apilan (con conectores «↓»). Mismas zonas y
// colores que `activityZones`; solo cambia el arreglo.
export function activityFlow(nodesByKey, renderRow, kind = "operation") {
  const row = (key, label = null) => (nodesByKey[key] ? renderRow(label, nodesByKey[key]) : null);
  const comment = nodesByKey.comment ? el("div", { class: "pt-0.5" }, [nodesByKey.comment]) : null;

  let phases;
  if (kind === "condition") {
    phases = [
      { grow: "lg:flex-[1.2]", blocks: [
        zoneBlock("¿Qué quieres comprobar?", ZONE_TONES.condition, [row("condition", "Pregunta"), row("operation", "Comprobación"), row("conditionName", "Nombre"), row("evaluate")]),
      ] },
      { grow: "lg:flex-1", blocks: [
        zoneBlock("¿Qué obtienes?", ZONE_TONES.result, [row("result", "Dato lógico")]),
        zoneBlock("¿Para qué lo usarás?", ZONE_TONES.purpose, [row("purpose"), row("usedIn", SUBLABELS.usedIn)]),
      ] },
      { grow: "lg:flex-1", blocks: [
        zoneBlock("¿Qué pasa según el resultado?", ZONE_TONES.branch, [row("ifTrue", "Si se cumple, entonces:"), row("ifFalse", "Si no se cumple, entonces:")]),
        comment,
      ] },
    ];
  } else {
    phases = [
      { grow: "lg:flex-1", blocks: [
        zoneBlock("¿Qué necesitas hacer?", ZONE_TONES.need, [row("problem")]),
        zoneBlock("¿Qué necesitas para hacerlo?", ZONE_TONES.input, [row("inputs")]),
      ] },
      { grow: "lg:flex-[1.4]", blocks: [
        zoneBlock("¿Qué debes hacer?", ZONE_TONES.process, [row("operation")]),
      ] },
      { grow: "lg:flex-1", blocks: [
        zoneBlock("¿Qué obtienes?", ZONE_TONES.result, [row("result")]),
        zoneBlock("¿Para qué usarás este dato?", ZONE_TONES.purpose, [row("purpose"), row("usedIn", SUBLABELS.usedIn)]),
        comment,
      ] },
    ];
  }

  const columns = phases
    .map((phase) => {
      const present = phase.blocks.filter(Boolean);
      return present.length > 0 ? el("div", { class: `min-w-0 flex-1 space-y-3 ${phase.grow}` }, present) : null;
    })
    .filter(Boolean);

  const children = [];
  columns.forEach((column, index) => {
    if (index > 0) children.push(flowConnector());
    children.push(column);
  });
  return el("div", { class: "flex flex-col gap-3 lg:flex-row lg:items-stretch" }, children);
}

// Conector entre fases: hacia abajo cuando se apilan, hacia la derecha en fila.
function flowConnector() {
  // Disco de 26px con la flecha: hacia abajo cuando las zonas se apilan, hacia la
  // derecha cuando van en fila (a partir de lg).
  return el("div", { class: "flex shrink-0 items-center justify-center py-1 lg:px-1 lg:py-0", "aria-hidden": "true" }, [
    el("span", { class: "flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-muted)] shadow-[var(--lx-shadow-card)]" }, [
      el("span", { class: "lg:hidden" }, "↓"),
      el("span", { class: "hidden lg:inline" }, "→"),
    ]),
  ]);
}

// Zona agrupada: barra y título (con icono) en su color + filas. Null si no hay filas.
function zoneBlock(title, tone, rows) {
  const present = rows.filter(Boolean);
  if (present.length === 0) return null;
  return el("div", { class: `border-l-2 ${tone.bar} pl-2.5` }, [
    el("div", { class: `mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${tone.title}` }, [
      icon(tone.icon, "h-3 w-3"),
      el("span", {}, title),
    ]),
    el("div", { class: "space-y-1" }, present),
  ]);
}
