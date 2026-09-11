// Vista de la cadena del análisis: un FLUJO vertical que hace visible el
// razonamiento — los datos de entrada bajan hacia cada transformación, que produce
// nuevos datos, hasta llegar a la decisión y a la información final. No repite las
// tarjetas de construcción: es una representación de conjunto (más compacta) para
// COMPRENDER cómo fluye el análisis. Deriva de buildChain; solo se ocupa del DOM.

import { el, clear } from "../utils/dom.js";
import { DATA_TYPES, labelOf } from "../models/dataTypes.js";
import { buildFlowTree } from "../models/chainModel.js";
import { formulaBox } from "./cardLayout.js";
import { icon } from "./icons.js";
import { goToStage } from "./stageNav.js";

// Acentos por tipo de nodo, coherentes con el color semántico del resto:
// entrada lavanda, operación superficie neutra, condición ámbar, final verde.
const NODE = {
  input: "border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)]/40",
  operation: "border-[var(--lx-border)] bg-[var(--lx-surface)]",
  condition: "border-[var(--lx-condicion-border)] bg-[var(--lx-condicion-bg)]/40",
};

// Zoom de la etapa Cadena (Zen). Vive a nivel de módulo para sobrevivir a los
// re-render (al editar en otra etapa) y que el nivel elegido se conserve.
let chainZoom = 1;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.1;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));

export class ChainView {
  constructor({ container }) {
    this.container = container;
  }

  render(chain) {
    clear(this.container);
    // La cadena no se vacía por sí sola: refleja las demás etapas. Cuando falta una
    // parte, se muestra un hueco punteado que lleva a la etapa que la completa.
    const hasContent = chain.entradas.length > 0 || chain.proceso.length > 0 || chain.salidas.length > 0;
    const tree = buildFlowTree(chain);
    // El zoom se aplica al contenido interior; la envoltura conserva el scroll.
    const inner = el("div", { class: "flex min-w-min flex-col items-center px-1 pb-2" }, [
      hasContent ? summaryBar(chain) : null,
      ...flowBlocks(chain, tree),
    ].filter(Boolean));
    inner.style.zoom = String(chainZoom);
    // Árbol centrado; si una bifurcación lo ensancha, la columna hace scroll horizontal.
    const wrapper = el("div", { class: "mx-auto max-w-[1100px] overflow-x-auto" }, [inner]);
    this.container.append(wrapper);
    // Píldora de zoom flotante: fija dentro de la etapa Cadena (solo visible aquí,
    // pues su ancestro se oculta en las demás etapas), alineada con el botón «?».
    this.container.append(zoomPill(inner));
  }
}

// Píldora flotante (Zen): alejar / porcentaje / acercar · encuadre (volver a 100%).
function zoomPill(inner) {
  const label = el("span", { class: "min-w-[38px] text-center text-[12px] tabular-nums text-[var(--lx-ink-muted)]" }, `${Math.round(chainZoom * 100)}%`);
  const apply = () => {
    inner.style.zoom = String(chainZoom);
    label.textContent = `${Math.round(chainZoom * 100)}%`;
  };
  const setZoom = (value) => {
    chainZoom = clampZoom(value);
    apply();
  };
  const roundBtn = (content, title, onClick) =>
    el("button", {
      type: "button",
      title,
      "aria-label": title,
      class: "flex h-7 w-7 items-center justify-center rounded-full text-[15px] text-[var(--lx-ink-body)] hover:bg-[var(--lx-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lx-violet)]",
      onclick: onClick,
    }, content);
  return el("div", { class: "fixed bottom-5 right-[76px] z-40 flex items-center gap-0.5 rounded-full border border-[var(--lx-border)] bg-[var(--lx-surface)]/95 p-1 shadow-[var(--lx-shadow-card)] backdrop-blur" }, [
    roundBtn("−", "Alejar", () => setZoom(chainZoom - ZOOM_STEP)),
    label,
    roundBtn("+", "Acercar", () => setZoom(chainZoom + ZOOM_STEP)),
    el("span", { class: "mx-0.5 h-4 w-px bg-[var(--lx-border)]", "aria-hidden": "true" }),
    roundBtn(icon("maximize", "h-3.5 w-3.5"), "Ajustar a la vista", () => setZoom(1)),
  ]);
}

// Ensambla el flujo: Entradas → árbol de actividades (con sus bifurcaciones) →
// información final. Cuando falta una parte, un hueco lleva a completarla.
function flowBlocks(chain, tree) {
  const blocks = [];
  blocks.push(chain.entradas.length > 0 ? framed(inputsBlock(chain.entradas)) : holeButton("Aquí irán tus datos de entrada · Ir a Datos", "datos"));
  blocks.push(down());
  if (tree.root) {
    blocks.push(renderTreeNode(tree.root));
    if (tree.orphans.length > 0) blocks.push(orphansSection(tree.orphans));
  } else {
    blocks.push(holeButton("Aquí irán tus actividades · Ir a Construcción", "construccion"));
  }
  // El bloque de resumen «Información final» solo aporta cuando el árbol NO muestra ya
  // cada respuesta como hoja: si todas las salidas son ramas de decisión (ya visibles
  // como «Fin del análisis»), se omite para no duplicarlas.
  const allBranchOutputs = chain.salidas.length > 0 && chain.salidas.every((output) => output.branch);
  if (!allBranchOutputs) {
    blocks.push(down());
    blocks.push(framed(outputBlock(chain.salidas)));
  }
  return blocks;
}

// Ancho cómodo y centrado para los bloques anchos (Entradas / Información final).
function framed(node) {
  return el("div", { class: "w-[min(90vw,560px)]" }, [node]);
}

// Ancho de las tarjetas del árbol. En el TRONCO la tarjeta crece con su contenido
// (`w-fit`) para que la expresión quepa en una línea siempre que sea posible, hasta
// un máximo. En una BIFURCACIÓN el ancho es fijo, para que las columnas quepan lado
// a lado; ahí la expresión se ajusta en varias líneas.
function treeCardWrap(node, inBranch) {
  const width = inBranch ? "w-[min(88vw,420px)]" : "w-fit min-w-[min(88vw,300px)] max-w-[min(92vw,820px)]";
  return el("div", { class: width }, [node]);
}

// Un nodo del árbol de flujo (recursivo). Actividad: tarjeta y, si sigue, «↓» al
// siguiente. Decisión: tarjeta y bifurcación en dos columnas. Ref: marcador de una
// actividad ya mostrada (convergencia o bucle), para no repetirla. `inBranch` indica
// si el nodo cuelga de una bifurcación (ancho fijo) o del tronco (ancho al contenido).
function renderTreeNode(node, inBranch = false) {
  if (!node) return null;
  if (node.type === "ref") return treeCardWrap(refCard(node.step), inBranch);
  if (node.type === "decision") {
    return el("div", { class: "flex flex-col items-center" }, [
      treeCardWrap(conditionCard(node.step), inBranch),
      el("div", { class: "h-4 w-px bg-[var(--lx-border-dashed)]", "aria-hidden": "true" }), // tronco hasta la horquilla
      branchSplit(node.branches),
    ]);
  }
  const card = node.step.kind === "condition" ? conditionCard(node.step) : operationNode(node.step);
  const children = [treeCardWrap(card, inBranch)];
  if (node.next) children.push(down(), renderTreeNode(node.next, inBranch));
  return el("div", { class: "flex flex-col items-center" }, children);
}

// Bifurcación de una decisión: dos columnas (Sí | No) que cuelgan de una horquilla.
// En pantallas estrechas se apilan; en anchas van lado a lado con la horquilla.
function branchSplit(branches) {
  return el("div", { class: "flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-center sm:gap-0" }, branches.map((branch, index) => branchCell(branch, index, branches.length)));
}

// Una columna de la bifurcación. En fila (sm+) dibuja su parte de la horquilla con
// pseudo-elementos: un tramo horizontal arriba —recortado en los extremos para que
// la barra quede centrada— y una bajada vertical al centro de la columna.
function branchCell(branch, index, total) {
  const first = index === 0;
  const last = index === total - 1;
  const isYes = branch.branchCase === "Sí";
  const fork =
    "sm:before:absolute sm:before:left-1/2 sm:before:top-0 sm:before:h-5 sm:before:w-px sm:before:-translate-x-1/2 sm:before:bg-[var(--lx-border-dashed)] sm:before:content-[''] " +
    "sm:after:absolute sm:after:top-0 sm:after:h-px sm:after:bg-[var(--lx-border-dashed)] sm:after:content-[''] " +
    (first ? "sm:after:left-1/2 sm:after:right-0 " : last ? "sm:after:left-0 sm:after:right-1/2 " : "sm:after:inset-x-0 ");
  return el("div", { class: `relative flex flex-col items-center px-3 sm:px-5 sm:pt-6 ${fork}` }, [
    el("div", { class: "mb-2 flex items-center gap-1.5" }, [caseBadge(branch.branchCase), el("span", { class: "text-[12px] text-[var(--lx-ink-muted)]" }, isYes ? "Si se cumple" : "Si no se cumple")]),
    branchOutcome(branch),
  ]);
}

function branchOutcome(branch) {
  // Todo lo que cuelga de una bifurcación va con ancho fijo (columnas lado a lado).
  if (branch.kind === "continue") return renderTreeNode(branch.node, true);
  if (branch.kind === "final") return treeCardWrap(finalLeaf(branch.parts), true);
  return treeCardWrap(leafCard(branch.kind === "pending" ? "Pendiente de asignación" : "Sin definir"), true);
}

// Hoja «finaliza»: el análisis termina en este camino, con su respuesta (verde).
function finalLeaf(parts) {
  return el("div", { class: "rounded-[var(--lx-r-panel)] border border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] px-3.5 py-3" }, [
    el("div", { class: "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--lx-resultante-fg)]" }, [icon("flag", "h-3.5 w-3.5"), "Fin del análisis"]),
    parts.length > 0
      ? el("div", { class: "text-sm text-[var(--lx-ink-body)]" }, [expressionEl(parts, "emerald")])
      : el("span", { class: "text-sm italic text-[var(--lx-ink-muted)]" }, "sin respuesta"),
  ]);
}

// Hoja de un camino sin destino asignado (pendiente o sin definir).
function leafCard(text) {
  return el("div", { class: "rounded-[var(--lx-r-panel)] border border-dashed border-[var(--lx-border-dashed)] px-3.5 py-3 text-sm italic text-[var(--lx-ink-muted)]" }, text);
}

// Marcador de una actividad ya mostrada (convergencia o bucle): en vez de repetir el
// nodo, indica que el flujo vuelve a ella.
function refCard(step) {
  const detail = step.description || step.conditionLabel || "";
  return el("div", { class: "flex items-center gap-2 rounded-[var(--lx-r-panel)] border border-dashed border-[var(--lx-condicion-border)] bg-[var(--lx-condicion-bg)]/40 px-3.5 py-2.5 text-[13px] text-[var(--lx-condicion-fg)]" }, [
    el("span", { class: "text-base leading-none", "aria-hidden": "true" }, "↩"),
    el("span", {}, `Vuelve a la Actividad ${step.position}${detail ? ` · ${detail}` : ""}`),
  ]);
}

// Actividades que el flujo no alcanza desde la primera (sin conexión): se listan
// aparte para no perderlas de vista.
function orphansSection(orphans) {
  return el("div", { class: "mt-6 w-[min(90vw,560px)] rounded-[var(--lx-r-panel)] border border-dashed border-[var(--lx-border-dashed)] p-3.5" }, [
    el("div", { class: "mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--lx-ink-muted)]" }, "Sin conectar con el flujo"),
    el("div", { class: "space-y-1.5" }, orphans.map((step) =>
      el("div", { class: "text-[13px] text-[var(--lx-ink-body)]" }, `Actividad ${step.position} · ${step.description || step.conditionLabel || "(sin nombre)"}`),
    )),
  ]);
}

// Hueco punteado: cuando falta una parte de la cadena, invita a ir a completarla.
function holeButton(text, stageId) {
  return el(
    "button",
    {
      type: "button",
      class: "flex w-full items-center justify-center gap-1.5 rounded-[var(--lx-r-panel)] border border-dashed border-[var(--lx-border-dashed)] px-3 py-5 text-[13px] font-medium text-[var(--lx-ink-muted)] hover:border-[var(--lx-violet)] hover:text-[var(--lx-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lx-violet)]",
      onclick: () => goToStage(stageId),
    },
    [text, icon("chevron", "h-4 w-4 -rotate-90")],
  );
}

// Resumen no invasivo del estado del razonamiento: cuántos datos, operaciones,
// decisiones y respuestas lleva el análisis. Da una visión rápida de conjunto.
function summaryBar(chain) {
  const operaciones = chain.proceso.filter((step) => step.kind !== "condition").length;
  const decisiones = chain.proceso.filter((step) => step.kind === "condition" && step.evaluateNow && step.purpose === "decision").length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const stats = [
    [plural(chain.entradas.length, "dato de entrada", "datos de entrada"), "bg-[var(--lx-entrada-fg)]"],
    [plural(operaciones, "operación", "operaciones"), "bg-[var(--lx-violet)]"],
    [plural(decisiones, "decisión", "decisiones"), "bg-[var(--lx-condicion-fg)]"],
    [plural(chain.salidas.length, "respuesta final", "respuestas finales"), "bg-[var(--lx-resultante-fg)]"],
  ];
  return el("div", { class: "mb-4 flex flex-wrap justify-center gap-2" }, stats.map(([text, dot]) =>
    el("span", { class: "inline-flex items-center gap-1.5 rounded-full border border-[var(--lx-border)] bg-[var(--lx-surface)] px-2.5 py-1 text-xs font-medium text-[var(--lx-ink-body)]" }, [el("span", { class: `h-1.5 w-1.5 shrink-0 rounded-full ${dot}` }), text]),
  ));
}

// Conector vertical entre nodos.
function down() {
  return el("div", { class: "flex justify-center py-1 text-[var(--lx-ink-ghost)]", "aria-hidden": "true" }, "↓");
}

// Nodo de entradas: los datos que recibe el programa (lavanda).
function inputsBlock(entradas) {
  return el("div", { class: `rounded-[var(--lx-r-panel)] border ${NODE.input} p-3.5` }, [
    blockHeader("Entradas", "text-[var(--lx-ink-muted)]"),
    entradas.length > 0
      ? el("div", { class: "flex flex-wrap gap-1.5" }, entradas.map((datum) => dataChip(datum, "input")))
      : el("p", { class: "text-sm text-[var(--lx-ink-muted)]" }, "Aún no has identificado datos de entrada."),
  ]);
}

// Cabecera de bloque (Entradas / Información final): etiqueta en versalitas, sin icono.
function blockHeader(text, color) {
  return el("div", { class: `mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${color}` }, text);
}

// Fila «expresión → dato producido», en línea, como en el diseño.
function producesRow(exprNode, result) {
  return el("div", { class: "flex flex-wrap items-center gap-2" }, [
    exprNode,
    result ? arrow() : null,
    result ? dataChip(result, "produced") : null,
  ].filter(Boolean));
}

// Nodo de operación: la expresión que combina datos y el dato que produce.
function operationNode(step) {
  const expr =
    step.operation.length > 0
      ? formulaBox(expressionEl(step.operation))
      : step.inputs.length > 0
        ? el("div", { class: "flex flex-wrap gap-1.5" }, step.inputs.map((datum) => dataChip(datum, datum.produced ? "produced" : "input")))
        : el("span", { class: "text-sm italic text-[var(--lx-ink-muted)]" }, "sin operación definida");
  const title = step.description || `Actividad ${step.position}`;
  return nodeShell(step, "bg-[var(--lx-violet)]", "Operación", NODE.operation, title, [producesRow(expr, step.result)]);
}

// Tarjeta de condición: la pregunta y la comparación (ámbar). No dibuja sus caminos:
// en el árbol la decisión se bifurca en columnas propias (branchSplit).
function conditionCard(step) {
  const question = step.condition ? el("p", { class: "text-sm italic text-[var(--lx-ink-body)]" }, `¿${step.condition.replace(/^¿|\?$/g, "")}?`) : null;
  const comparison = step.operation.length > 0 ? formulaBox(expressionEl(step.operation)) : el("span", { class: "text-sm italic text-[var(--lx-ink-muted)]" }, "sin comparación definida");
  const compareRow = producesRow(comparison, step.evaluateNow ? step.result : null);
  const title = step.description || step.conditionLabel || `Condición ${step.position}`;
  return nodeShell(step, "bg-[var(--lx-amber)]", "Condición", NODE.condition, title, [question, compareRow]);
}

// Nodo genérico: número de paso (cuadrado con color), título en tinta y, a la
// derecha, la etiqueta del tipo de nodo. El cuerpo se alinea debajo.
function nodeShell(step, numberBg, kindLabel, cls, title, body) {
  return el("div", { class: `rounded-[var(--lx-r-panel)] border ${cls} p-3.5` }, [
    el("div", { class: "mb-2 flex items-center gap-2.5" }, [
      el("span", { class: `flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[11px] font-semibold text-white ${numberBg}` }, String(step.position)),
      el("span", { class: "min-w-0 flex-1 break-words text-[15px] font-semibold text-[var(--lx-ink)]" }, title),
      el("span", { class: "shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--lx-ink-muted)]" }, kindLabel),
    ]),
    el("div", { class: "space-y-2 pl-[34px]" }, body.filter(Boolean)),
  ]);
}

// Nodo de información final (verde, con más protagonismo): la culminación del
// análisis. Todo el proceso produce finalmente esta información.
function outputBlock(salidas) {
  const items =
    salidas.length > 0
      ? salidas.map((output) =>
          el("div", { class: "flex flex-wrap items-center gap-2 rounded-[var(--lx-r-control)] bg-[var(--lx-surface)]/60 px-2.5 py-1.5 text-sm" }, [
            output.branch ? caseBadge(output.branch) : null,
            el("span", { class: "font-medium text-[var(--lx-resultante-fg)]" }, [expressionEl(output.parts, "emerald")]),
            output.condition ? el("span", { class: "text-[12px] text-[var(--lx-ink-muted)]" }, `cuando ${output.condition}`) : null,
          ].filter(Boolean)),
        )
      : [el("p", { class: "text-sm text-[var(--lx-resultante-fg)]/70" }, "Aún no defines la información final (un propósito «Generar la información final» o un camino de respuesta).")];
  return el("div", { class: "rounded-[var(--lx-r-card)] border border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] p-3.5" }, [
    blockHeader("Información final", "text-[var(--lx-resultante-fg)]"),
    el("div", { class: "space-y-1" }, items),
  ]);
}

// Flecha en línea "→" para "produce" / "entonces" (decorativa).
function arrow() {
  return el("span", { class: "font-semibold text-[var(--lx-ink-muted)]", "aria-hidden": "true" }, "→");
}

// Ficha de un dato: el nombre en monoespaciada y el tipo como etiqueta discreta.
// Un dato de entrada usa superficie neutra; uno producido, el verde de resultado.
function dataChip(datum, tone) {
  const style = tone === "produced"
    ? "border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)]"
    : "border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-body)]";
  const type = labelOf(DATA_TYPES, datum.type);
  return el("span", { class: `inline-flex max-w-full items-center gap-1.5 rounded-[var(--lx-r-chip)] border px-2 py-1 text-sm ${style}` }, [
    el("span", { class: "min-w-0 [overflow-wrap:anywhere] [font-family:var(--lx-font-mono)] text-[13px]" }, datum.name || "(sin nombre)"),
    type ? el("span", { class: "shrink-0 text-[11px] font-normal text-[var(--lx-ink-muted)]" }, type) : null,
  ].filter(Boolean));
}

// Indica el caso de la condición: Sí (se cumple) o No (no se cumple). Ficha de
// esquinas redondeadas coherente con los distintivos Sí/No de la tarjeta.
function caseBadge(branchCase) {
  const style = branchCase === "Sí" ? "bg-[var(--lx-green)] text-white" : "bg-[var(--lx-negativo)] text-white";
  return el("span", { class: `shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold ${style}` }, branchCase);
}

// Renderiza una expresión resaltando los datos (ref) frente a operadores y texto.
// `max-w-full` + salto de palabra en los tokens: un nombre largo parte en varias
// líneas dentro de la tarjeta en vez de desbordarla.
function expressionEl(parts, tone = "blue") {
  const children = [];
  parts.forEach((part, index) => {
    if (index > 0) children.push(" ");
    children.push(partNode(part, tone));
  });
  return el("span", { class: "flex max-w-full flex-wrap items-center gap-1" }, children);
}

function partNode(part, tone) {
  if (part.kind === "ref") {
    const style = tone === "emerald" ? "bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)]" : "bg-[var(--lx-entrada-bg)] text-[var(--lx-entrada-fg)]";
    return el("span", { class: `min-w-0 [overflow-wrap:anywhere] rounded px-1 py-0.5 text-xs font-medium ${style}`, title: "Dato utilizado" }, part.text);
  }
  if (part.kind === "cond") {
    return el("span", { class: "min-w-0 [overflow-wrap:anywhere] rounded bg-[var(--lx-condicion-bg)] px-1 py-0.5 text-xs font-semibold text-[var(--lx-condicion-fg)]", title: "Condición" }, part.text);
  }
  if (part.kind === "op") return el("span", { class: "text-[var(--lx-ink-muted)]" }, part.text);
  return el("span", {}, part.text);
}
