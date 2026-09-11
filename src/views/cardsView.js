// Vista de actividades como MAESTRO-DETALLE: a la izquierda una lista de las
// actividades con su estado (✓ completa / ● en construcción / ○ pendiente /
// ⚠ revisar) y a la derecha la actividad seleccionada como espacio de trabajo
// principal. Así el estudiante siempre sabe dónde está, qué construye y qué le
// falta, sin ver todas las tarjetas a la vez. Comparte los constructores de campos
// (rowEditor) y las zonas de razonamiento (cardLayout). Solo se ocupa del DOM.

import { el, clear } from "../utils/dom.js";
import {
  buildRowFields,
  renderPreservingFocus,
  dragHandle,
  deleteButton,
  addActivityButton,
  buildActivityList,
  markDropTarget,
  clearDropTarget,
} from "./rowEditor.js";
import { icon } from "./icons.js";
import { goToStage } from "./stageNav.js";

export class CardsView {
  constructor({ container }) {
    this.container = container;
  }

  render(analysis, handlers) {
    clear(this.container);
    const dataById = new Map(analysis.data.map((entry) => [entry.id, entry]));
    const activities = buildActivityList(analysis.rows, dataById);
    const producedIds = new Set(analysis.rows.map((row) => row.resultId).filter(Boolean));
    this.conditions = analysis.rows.filter((row) => row.kind === "condition"); // para etiquetar tokens `cond`
    const rows = analysis.rows;

    if (rows.length === 0) {
      this.container.append(activitiesEmptyState(handlers.onAddRow));
      return;
    }

    // La actividad seleccionada; si no hay una válida, se trabaja la primera.
    const wanted = handlers.selectedRowId?.();
    const selected = rows.find((row) => row.id === wanted) ?? rows[0];

    // La lista intercala, entre dos pasos, un conector con el dato que produce el
    // paso anterior: así se ve qué se transporta de una actividad a la siguiente.
    const listChildren = [];
    rows.forEach((row, index) => {
      if (index > 0) {
        const produced = rows[index - 1].resultId ? dataById.get(rows[index - 1].resultId) : null;
        listChildren.push(railConnector(produced));
      }
      listChildren.push(this.#listItem(row, index, selected.id, dataById, handlers));
    });
    const list = el("ol", {}, listChildren);
    // Los botones de agregar van ARRIBA: con muchas actividades no obligan a hacer
    // scroll hasta el final de la lista para crear una nueva.
    const railLabel = el("div", { class: "mb-2 flex items-baseline gap-2" }, [
      el("span", { class: "text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--lx-ink-muted)]" }, "El flujo"),
      el("span", { class: "text-[12px] text-[var(--lx-ink-ghost)]" }, `${rows.length} ${rows.length === 1 ? "paso" : "pasos"}`),
    ]);
    const master = el("div", { class: "space-y-3 md:sticky md:top-[20px]" }, [railLabel, list, addActivityButton(handlers.onAddRow)]);
    const detail = this.#workspace(selected, rows, dataById, handlers, activities, producedIds);

    this.container.append(
      el("div", { class: "grid items-start gap-[22px] md:grid-cols-[268px_minmax(0,1fr)]" }, [master, detail]),
    );
  }

  renderKeepingFocus(analysis, handlers) {
    renderPreservingFocus(this.container, () => this.render(analysis, handlers));
  }

  // Un elemento de la lista: número + título + tipo (dos líneas), con un punto de
  // estado a la derecha. Seleccionable y arrastrable (por su tirador). Lleva
  // `data-row-id` (uno por actividad); el espacio de trabajo no, para no duplicar.
  #listItem(row, index, selectedId, dataById, handlers) {
    const isSelected = row.id === selectedId;
    const isCondition = row.kind === "condition";
    const status = isSelected ? "active" : handlers.rowStatus?.(row.id) ?? "todo";
    const setDragged = (id) => {
      this.draggedRowId = id;
    };
    return el(
      "li",
      {
        dataset: { rowId: row.id },
        class: `relative flex items-center gap-2 rounded-[var(--lx-r-control)] border py-2 pl-2 pr-3 transition ${
          isSelected ? "border-[oklch(0.90_0.04_300)] bg-[oklch(0.972_0.018_300)] shadow-[var(--lx-shadow-card)]" : "border-[var(--lx-border)] bg-[var(--lx-surface)] hover:border-[var(--lx-border-dashed)] hover:bg-[var(--lx-bg)]"
        }`,
        ondragover: (event) => {
          event.preventDefault();
          if (this.draggedRowId && this.draggedRowId !== row.id) markDropTarget(event.currentTarget);
        },
        ondragleave: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) clearDropTarget(event.currentTarget);
        },
        ondrop: (event) => {
          event.preventDefault();
          clearDropTarget(event.currentTarget);
          const fromId = this.draggedRowId;
          this.draggedRowId = null;
          if (fromId && fromId !== row.id) handlers.onMoveRow(fromId, row.id);
        },
      },
      [
        dragHandle(row.id, setDragged),
        railNumber(index + 1, isSelected),
        el(
          "button",
          {
            type: "button",
            class: "flex min-w-0 flex-1 flex-col text-left",
            onclick: () => handlers.onSelectRow?.(row.id),
          },
          [
            el("span", { class: `min-w-0 truncate text-[13.5px] ${isSelected ? "font-semibold text-[var(--lx-ink)]" : "font-medium text-[var(--lx-ink-body)]"}` }, activityTitle(row, dataById)),
            el("span", { class: "text-[12px] text-[var(--lx-ink-muted)]" }, isCondition ? "Condición" : "Operación"),
          ],
        ),
        statusDot(status),
      ],
    );
  }

  // Espacio de trabajo de la actividad: barra de contexto, cabecera (tipo + nombre
  // del paso), las tres zonas del razonamiento, el pie «¿Y después?» y la navegación.
  #workspace(row, rows, dataById, handlers, activities, producedIds) {
    const index = rows.indexOf(row);
    const isCondition = row.kind === "condition";
    const fields = buildRowFields(row, dataById, handlers, activities, producedIds);
    const result = row.resultId ? dataById.get(row.resultId) : null;

    // El nombre del paso (la necesidad, o el nombre de la condición) es el título:
    // se reutiliza el campo editable, restilizado como encabezado grande.
    const titleInput = isCondition ? fields.conditionName : fields.problem;
    if (titleInput) {
      titleInput.className =
        "w-full min-w-0 resize-none overflow-hidden whitespace-nowrap border-0 bg-transparent p-0 [font-family:var(--lx-font-display)] text-[21px] font-semibold leading-tight tracking-[-0.015em] text-[var(--lx-ink)] outline-none placeholder:text-[var(--lx-ink-ghost)] focus:ring-0";
      titleInput.placeholder = isCondition ? "Nombra la comprobación…" : "Nombra este paso…";
      if (titleInput.tagName === "TEXTAREA") titleInput.rows = 1;
    }
    const accent = isCondition ? "text-[var(--lx-condicion-fg)]" : "text-[var(--lx-violet)]";
    const header = el("div", { class: "flex items-start gap-3 border-b border-[var(--lx-border-soft)] pb-4" }, [
      workspaceNumber(index + 1, isCondition),
      el("div", { class: "min-w-0 flex-1" }, [
        el("p", { class: `text-[11.5px] font-semibold uppercase tracking-[0.08em] ${accent}` }, isCondition ? "Condición" : "Operación"),
        el("div", { class: "mt-0.5" }, [titleInput ?? el("span", {}, activityTitle(row, dataById))]),
        el("p", { class: "mt-1 text-[13px] text-[var(--lx-ink-muted)]" }, isCondition ? "Una condición comprueba algo: una pregunta que se responde Sí o No." : "Una operación calcula o transforma datos para obtener uno nuevo."),
      ]),
      el("div", { class: "shrink-0" }, [deleteButton(() => handlers.onDeleteRow(row.id))]),
    ]);

    const zones = isCondition ? conditionZones(fields) : operationZones(fields);
    const after = afterBlock(fields, result, row.id);
    const nav = workspaceNav(index, rows.length, rows, handlers);

    // Sin overflow-hidden: los emergentes de «+ elemento» / «+ Agregar dato» se
    // salen de la tarjeta y no deben recortarse. Las bandas inferiores se redondean
    // por separado para conservar las esquinas de la tarjeta.
    const card = el("div", { class: "rounded-[var(--lx-r-card)] border border-[var(--lx-border)] bg-[var(--lx-surface)] shadow-[var(--lx-shadow-card)]", dataset: { workspaceRow: row.id } }, [
      el("div", { class: "p-5 sm:p-6" }, [header, el("div", { class: "mt-5" }, [zones])]),
      after,
      nav,
    ]);
    return el("div", { class: "space-y-3" }, [contextBar(index, rows, dataById), card]);
  }
}

// Barra de contexto: de dónde viene el dato (paso anterior o «Datos de entrada»),
// el paso actual y a dónde va (paso siguiente o «Información final»).
function contextBar(index, rows, dataById) {
  const step = (i) => `Actividad ${i + 1} · ${activityTitle(rows[i], dataById)}`;
  const prev = index === 0 ? "Datos de entrada" : step(index - 1);
  const next = index === rows.length - 1 ? "Información final" : step(index + 1);
  const arrow = () => el("span", { class: "shrink-0 text-[var(--lx-border-dashed)]" }, "→");
  return el("div", { class: "flex items-center gap-2 overflow-x-auto rounded-[var(--lx-r-panel)] bg-[oklch(0.955_0.012_290)] px-3.5 py-2 text-[12.5px]" }, [
    el("span", { class: "shrink-0 text-[var(--lx-ink-muted)]" }, prev),
    arrow(),
    el("span", { class: "shrink-0 font-semibold text-[var(--lx-ink)]" }, step(index)),
    arrow(),
    el("span", { class: "shrink-0 text-[var(--lx-ink-muted)]" }, next),
  ]);
}

// Número del paso en el riel: violeta lleno cuando está seleccionado.
function railNumber(position, selected) {
  return el(
    "span",
    { class: `flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-semibold ${selected ? "bg-[var(--lx-violet)] text-white" : "bg-[var(--lx-surface-sunken)] text-[var(--lx-ink-muted)]"}` },
    String(position),
  );
}

// Cuadrado con el número del paso en la cabecera del espacio de trabajo.
function workspaceNumber(position, isCondition) {
  const bg = isCondition ? "bg-[var(--lx-amber)]" : "bg-[var(--lx-violet)]";
  return el("span", { class: `flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] ${bg} text-[14px] font-semibold text-white` }, String(position));
}

// Punto de estado (7px) a la derecha del ítem del riel.
function statusDot(status) {
  const tone = { done: "bg-[var(--lx-green)]", active: "bg-[var(--lx-violet)]", warn: "bg-[var(--lx-amber)]", todo: "bg-[var(--lx-border-dashed)]" }[status] ?? "bg-[var(--lx-border-dashed)]";
  return el("span", { class: `h-[7px] w-[7px] shrink-0 rounded-full ${tone}`, title: STATUS_STYLE[status]?.title ?? "" });
}

// Zona numerada del razonamiento: título + ayuda + contenido.
function zone(n, title, help, content) {
  return el("div", { class: "min-w-0 flex-1 space-y-2" }, [
    el("div", { class: "flex items-center gap-2" }, [
      el("span", { class: "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--lx-surface-sunken)] text-[11px] font-semibold text-[var(--lx-ink-muted)]" }, String(n)),
      el("span", { class: "text-[14px] font-semibold text-[var(--lx-ink)]" }, title),
    ]),
    el("p", { class: "text-[12.5px] text-[var(--lx-ink-muted)]" }, help),
    el("div", { class: "min-w-0" }, [content]),
  ]);
}

// Conector circular entre zonas (→ en fila, ↓ apiladas).
function zoneArrow() {
  return el("div", { class: "flex shrink-0 items-center justify-center py-1 lg:px-1 lg:py-0", "aria-hidden": "true" }, [
    el("span", { class: "flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-muted)] shadow-[var(--lx-shadow-card)]" }, [
      el("span", { class: "lg:hidden" }, "↓"),
      el("span", { class: "hidden lg:inline" }, "→"),
    ]),
  ]);
}

function zonesRow(...zones) {
  const present = zones.filter(Boolean);
  const children = [];
  present.forEach((z, i) => {
    if (i > 0) children.push(zoneArrow());
    children.push(z);
  });
  return el("div", { class: "flex flex-col gap-3 lg:flex-row lg:items-start" }, children);
}

// Conector vertical entre la fila superior de zonas y la zona inferior a lo ancho.
function zoneDown() {
  return el("div", { class: "flex justify-center", "aria-hidden": "true" }, [
    el("span", { class: "flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-muted)] shadow-[var(--lx-shadow-card)]" }, "↓"),
  ]);
}

// Zonas de una operación (Zen): «Qué necesitas» y «Qué haces» arriba, lado a lado;
// «Qué obtienes» a lo ancho debajo, porque es el resultado del par de arriba.
function operationZones(fields) {
  return el("div", { class: "space-y-3" }, [
    zonesRow(
      zone(1, "Qué necesitas", "Los datos que entran en este paso.", fields.inputs),
      zone(2, "Qué haces", "Escribe la expresión que combina esos datos.", fields.operation),
    ),
    zoneDown(),
    zone(3, "Qué obtienes", "El dato nuevo que produce este paso.", fields.result),
  ]);
}

// Las zonas de una condición: Qué compruebas → Cómo lo compruebas → Qué obtienes,
// y debajo (si es una decisión evaluada) los caminos Sí/No.
function conditionZones(fields) {
  const check = el("div", { class: "space-y-2" }, [fields.condition, fields.evaluate].filter(Boolean));
  const paths = fields.ifTrue || fields.ifFalse
    ? el("div", { class: "mt-4 space-y-3 rounded-[var(--lx-r-panel)] border border-[var(--lx-condicion-border)] bg-[var(--lx-condicion-bg)]/40 p-3.5" }, [
        el("p", { class: "text-[13px] font-semibold text-[var(--lx-condicion-fg)]" }, "Entonces, ¿qué pasa en cada caso?"),
        el("div", { class: "grid gap-3 sm:grid-cols-2" }, [
          fields.ifTrue ? branchCase("yes", fields.ifTrue) : null,
          fields.ifFalse ? branchCase("no", fields.ifFalse) : null,
        ].filter(Boolean)),
      ])
    : null;
  return el("div", {}, [
    zonesRow(
      zone(1, "Qué compruebas", "La pregunta que se responde Sí o No.", check),
      zone(2, "Cómo lo compruebas", "La comparación que la decide.", fields.operation),
      fields.result ? zone(3, "Qué obtienes", "El dato lógico que produce.", fields.result) : null,
    ),
    paths,
  ].filter(Boolean));
}

// Un caso de la decisión: la respuesta a la pregunta (Sí/No) como distintivo de
// color, y debajo el editor de esa rama (qué respuesta o hacia dónde continúa).
function branchCase(kind, content) {
  const isYes = kind === "yes";
  const badge = el(
    "span",
    { class: `inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.03em] ${
      isYes
        ? "border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)]"
        : "border-[var(--lx-negativo-border)] bg-[var(--lx-negativo-bg)] text-[var(--lx-negativo-fg)]"
    }` },
    isYes ? "Sí" : "No",
  );
  return el("div", { class: "space-y-2 rounded-[var(--lx-r-panel)] border border-[var(--lx-border)] bg-[var(--lx-surface)] p-3" }, [
    el("div", { class: "flex items-center gap-2" }, [
      badge,
      el("span", { class: "text-[12.5px] text-[var(--lx-ink-muted)]" }, isYes ? "Si se cumple" : "Si no se cumple"),
    ]),
    content,
  ]);
}

// Filas con el pie «¿Y después?» expandido (Zen: plegado por defecto). Estado de
// vista efímero por fila, para que abrir/plegar sobreviva al re-render de edición.
const AFTER_OPEN = new Set();

// Pie «¿Y después?»: qué se hará con el dato producido (propósito segmentado),
// dónde se usa y el comentario. Solo aparece si la actividad produce un dato.
// Plegable: por defecto plegado, con un triángulo ▸/▾ que revela el detalle.
function afterBlock(fields, result, rowId) {
  if (!fields.purpose) return null;
  const resultName = result?.name ? result.name : "este dato";
  const open = AFTER_OPEN.has(rowId);
  const body = el("div", { class: "mt-3 grid gap-4 lg:grid-cols-2" }, [
    el("div", { class: "space-y-2" }, [
      fields.purpose,
      fields.usedIn ? el("div", { class: "flex flex-wrap items-center gap-2 text-[13px]" }, [el("span", { class: "text-[var(--lx-ink-muted)]" }, "Se usa en"), el("div", { class: "min-w-0 flex-1" }, [fields.usedIn])]) : null,
    ].filter(Boolean)),
    el("div", {}, [
      el("p", { class: "mb-1 text-[13px] text-[var(--lx-ink-body)]" }, "Comentario"),
      fields.comment,
    ]),
  ]);
  body.hidden = !open;
  const caret = el("span", { class: `inline-flex text-[var(--lx-ink-muted)] transition ${open ? "" : "-rotate-90"}` }, [icon("chevron", "h-4 w-4")]);
  const header = el(
    "button",
    {
      type: "button",
      "aria-expanded": String(open),
      class: "flex w-full flex-wrap items-baseline gap-x-2 text-left",
      onclick: () => {
        const nowOpen = !AFTER_OPEN.has(rowId);
        if (nowOpen) AFTER_OPEN.add(rowId);
        else AFTER_OPEN.delete(rowId);
        body.hidden = !nowOpen;
        caret.classList.toggle("-rotate-90", !nowOpen);
        header.setAttribute("aria-expanded", String(nowOpen));
      },
    },
    [
      caret,
      el("span", { class: "text-[14px] font-semibold text-[var(--lx-ink)]" }, "¿Y después?"),
      el("span", { class: "text-[13px] text-[var(--lx-ink-muted)]" }, `Qué harás con ${resultName}.`),
    ],
  );
  return el("div", { class: "border-t border-[var(--lx-border-soft)] bg-[var(--lx-surface-muted)] px-5 py-4 sm:px-6" }, [header, body]);
}

// Navegación entre actividades: paso anterior · «Actividad N de M» · siguiente
// (o «Continuar a Cadena» en la última).
function workspaceNav(index, total, rows, handlers) {
  const prev = index > 0 ? el("button", { type: "button", class: "inline-flex items-center gap-1.5 rounded-[var(--lx-r-control)] px-3 py-1.5 text-[13px] font-medium text-[var(--lx-ink-muted)] hover:bg-[var(--lx-bg)] hover:text-[var(--lx-ink-body)]", onclick: () => handlers.onSelectRow?.(rows[index - 1].id) }, [icon("chevron", "h-4 w-4 rotate-90"), "Paso anterior"]) : el("span", {});
  const isLast = index === total - 1;
  const next = el(
    "button",
    { type: "button", class: "inline-flex items-center gap-1.5 rounded-[var(--lx-r-control)] bg-[var(--lx-violet)] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--lx-violet-hover)]", onclick: () => (isLast ? goToStage("cadena") : handlers.onSelectRow?.(rows[index + 1].id)) },
    [isLast ? "Continuar a Cadena" : "Siguiente actividad", icon("chevron", "h-4 w-4 -rotate-90")],
  );
  return el("div", { class: "flex items-center justify-between gap-3 border-t border-[var(--lx-border-soft)] px-5 py-3 sm:px-6" }, [
    prev,
    el("span", { class: "text-[12.5px] text-[var(--lx-ink-muted)]" }, `Actividad ${index + 1} de ${total}`),
    next,
  ]);
}

// Estilo de cada estado de una actividad: un icono y un color representativos, para
// reconocerlo de un vistazo — completa (✓ verde), en construcción (✎ índigo),
// por revisar (⚠ ámbar) y pendiente (◎ gris).
const STATUS_STYLE = {
  done: { icon: "check", cls: "bg-[var(--lx-green)] text-white", title: "Completa" },
  active: { icon: "edit", cls: "bg-[var(--lx-violet)] text-white", title: "En construcción" },
  warn: { icon: "alert", cls: "bg-[var(--lx-amber)] text-white", title: "Por revisar" },
  todo: { icon: "target", cls: "bg-[var(--lx-ink-ghost)] text-white", title: "Pendiente" },
};

// Conector entre dos pasos del riel: una línea vertical y, si el paso anterior
// produce un dato, un chip con ese dato (lo que se transporta al siguiente paso).
function railConnector(datum) {
  return el("li", { class: "flex items-center gap-2 py-1.5 pl-[27px]", "aria-hidden": datum ? null : "true" }, [
    el("span", { class: "h-4 w-px shrink-0 bg-[var(--lx-border-dashed)]" }),
    datum
      ? el("span", { class: "[font-family:var(--lx-font-mono)] inline-flex items-center rounded-[var(--lx-r-chip)] border border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] px-1.5 py-0.5 text-[11px] text-[var(--lx-resultante-fg)]", title: "Dato que pasa al siguiente paso" }, datum.name || "(sin nombre)")
      : null,
  ]);
}

// Título breve de una actividad para la lista: su necesidad («¿qué necesitas
// hacer?») y, si aún no la tiene, el dato que produce o la pregunta que comprueba.
function activityTitle(row, dataById) {
  const problem = (row.problem ?? "").trim();
  if (problem) return problem;
  if (row.kind === "condition") {
    return (row.conditionName ?? "").trim() || (row.condition ?? "").trim() || "Condición sin definir";
  }
  const result = row.resultId ? dataById.get(row.resultId) : null;
  return (result?.name ?? "").trim() || "Actividad sin definir";
}

// Estado vacío: en vez de un cartel, el esqueleto de una actividad (las tres zonas
// en punteado) con la acción que lo llena en el centro.
function activitiesEmptyState(onAddRow) {
  const zone = (n, title, help) =>
    el("div", { class: "flex-1 rounded-[var(--lx-r-panel)] border border-dashed border-[var(--lx-border-dashed)] p-3" }, [
      el("div", { class: "mb-1 flex items-center gap-1.5" }, [
        el("span", { class: "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--lx-surface-sunken)] text-[11px] font-semibold text-[var(--lx-ink-muted)]" }, String(n)),
        el("span", { class: "text-[13px] font-semibold text-[var(--lx-ink-muted)]" }, title),
      ]),
      el("p", { class: "text-[12px] text-[var(--lx-ink-ghost)]" }, help),
    ]);
  const addBtn = (kind, label, iconName, cls) =>
    el("button", { type: "button", class: `inline-flex items-center gap-1.5 rounded-[var(--lx-r-control)] px-3.5 py-2 text-[13.5px] font-medium ${cls}`, onclick: () => onAddRow(kind) }, [icon(iconName, "h-4 w-4"), label]);
  return el("div", { class: "rounded-[var(--lx-r-card)] border border-dashed border-[var(--lx-border-dashed)] bg-[var(--lx-surface-muted)] p-6" }, [
    el("div", { class: "mb-5 flex flex-col gap-3 lg:flex-row" }, [
      zone(1, "Qué necesitas", "Los datos que usa este paso."),
      zone(2, "Qué haces", "La operación o comprobación."),
      zone(3, "Qué obtienes", "El dato que produce."),
    ]),
    el("p", { class: "mb-5 text-center text-[13.5px] text-[var(--lx-ink-muted)]" }, "Empieza por el primer paso del proceso: algo que calcule un dato nuevo o que compruebe una condición."),
    el("div", { class: "flex flex-wrap justify-center gap-2" }, [
      addBtn("operation", "+ Agregar operación", "workflow", "bg-[var(--lx-violet)] text-white hover:bg-[var(--lx-violet-hover)]"),
      addBtn("condition", "+ Agregar condición", "fork", "border border-[var(--lx-condicion-border)] bg-[var(--lx-condicion-bg)] text-[var(--lx-condicion-fg)] hover:brightness-95"),
    ]),
  ]);
}
