// Vista de la etapa "Datos de entrada": declara una vez los datos que recibe el
// programa. Refuerza la transformación enunciado → dato identificado → nombre, y
// muestra aparte, de solo lectura, los datos que producen las actividades. La
// tabla tiene dos modos (edición con controles, visualización de solo lectura).
// Solo se ocupa del DOM.

import { el, clear } from "../utils/dom.js";
import { DATA_TYPES, optionsOf, labelOf } from "../models/dataTypes.js";
import { NAME_CONVENTIONS } from "../models/nameConventions.js";
import { normalizeFieldOnBlur } from "./rowEditor.js";
import { helpButton } from "./helpView.js";
import { icon } from "./icons.js";

// Campo discreto en la tabla: sin borde ni fondo hasta pasar el cursor o enfocar,
// para que los datos se lean como texto y solo revelen el control al editarlos.
const FIELD_CLASS =
  "w-full rounded-[var(--lx-r-control)] border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] text-[var(--lx-ink)] " +
  "outline-none placeholder:text-[var(--lx-ink-ghost)] hover:border-[var(--lx-border)] focus:border-[oklch(0.72_0.09_300)] focus:bg-[var(--lx-surface)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)]";

// Tipo de dato como ficha (chip): solo lectura (typeChip) o editable (select con
// aspecto de ficha), coherente con la presentación de tipos en Construcción.
const TYPE_CHIP =
  "inline-flex items-center rounded-[6px] border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] px-2 py-0.5 text-[12px] font-medium text-[var(--lx-ink-body)]";
const TYPE_CHIP_SELECT =
  "inline-flex w-auto max-w-full cursor-pointer appearance-none rounded-[6px] border border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] px-2 py-1 text-[12px] font-medium text-[var(--lx-ink-body)] " +
  "outline-none hover:border-[var(--lx-entrada-border)] focus:border-[var(--lx-violet)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)]";

const GHOST_BUTTON_CLASS =
  "inline-flex h-[34px] items-center gap-1.5 rounded-[var(--lx-r-control)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-3 " +
  "text-[13.5px] font-medium text-[var(--lx-ink-body)] hover:bg-[var(--lx-bg)]";

const PRIMARY_BUTTON_CLASS =
  "inline-flex h-[34px] items-center gap-1.5 rounded-[var(--lx-r-control)] bg-[var(--lx-violet)] px-3.5 text-[13.5px] font-medium text-white hover:bg-[var(--lx-violet-hover)]";

const CARD_CLASS = "rounded-[var(--lx-r-card)] border border-[var(--lx-border)] bg-[var(--lx-surface)] p-5 shadow-[var(--lx-shadow-card)]";
const TH_CLASS = "border-b border-[var(--lx-border)] bg-[var(--lx-surface-sunken)] px-3 py-2.5 text-left align-top";
const TD_CLASS = "border-b border-[var(--lx-border-soft)] px-3 py-3 align-middle";
const MONO = "[font-family:var(--lx-font-mono)]";

// Columnas de la tabla: nombre + una nota de qué va en cada una.
const IDENTIFIED_COLUMN = { label: "Dato identificado", help: "Fragmento del enunciado", width: "min-w-[14rem]" };
const VALUE_COLUMN = { label: "Valor", help: "Opcional", width: "min-w-[6rem]" };
const TYPE_COLUMN = { label: "Tipo", help: "Numérico, Lógico o Texto", width: "min-w-[9rem]" };
const NAME_COLUMN = { label: "Nombre", help: "Nombre en el algoritmo", width: "min-w-[10rem]" };

// La estructura se adapta al modo de trabajo: con enunciado se muestra el fragmento
// identificado; sin enunciado (entrada manual) se omite y el nombre va al frente.
function columnsFor(usingStatement) {
  return usingStatement
    ? [IDENTIFIED_COLUMN, VALUE_COLUMN, TYPE_COLUMN, NAME_COLUMN]
    : [NAME_COLUMN, TYPE_COLUMN, VALUE_COLUMN];
}

export class InputsView {
  constructor({ container }) {
    this.container = container;
  }

  render(inputs, editing, handlers, usingStatement = false, nameConvention = "", produced = []) {
    clear(this.container);
    this.container.append(
      el("div", { class: "mx-auto max-w-[1000px] space-y-4" }, [
        usingStatement ? transformationLegend() : null,
        this.#inputsCard(inputs, editing, handlers, usingStatement, nameConvention),
        this.#producedCard(produced),
      ].filter(Boolean)),
    );
  }

  #inputsCard(inputs, editing, handlers, usingStatement, nameConvention) {
    const addButton = el("button", { type: "button", class: GHOST_BUTTON_CLASS, onclick: () => handlers.onAddInput() }, "+ Agregar dato");

    let body;
    let footer = null;
    if (inputs.length === 0 && !editing) {
      // Estado vacío: la tabla conserva su cabecera y muestra una fila fantasma con
      // el ejemplo, para que se vea qué va en cada columna antes de agregar el primero.
      body = el("div", { class: "space-y-2" }, [
        ghostTable(usingStatement),
        el("p", { class: "text-[12.5px] text-[var(--lx-ink-muted)]" }, "Así se verá cada dato. Agrégalos aquí o selecciónalos en el enunciado."),
      ]);
    } else if (editing) {
      body =
        inputs.length > 0
          ? inputsTable(inputs, true, handlers, usingStatement)
          : el("p", { class: "text-[13.5px] text-[var(--lx-ink-muted)]" }, "Agrega el primer dato de entrada.");
      // Pie discreto solo para la convención de nombres y cerrar la edición; el
      // «+ Agregar dato» vive en la cabecera, como en el diseño.
      footer = el("div", { class: "mt-4 flex flex-wrap items-center gap-2" }, [
        inputs.length > 0 ? conventionSelect(nameConvention, handlers.onSetNameConvention) : null,
        el("button", { type: "button", class: `${PRIMARY_BUTTON_CLASS} ml-auto`, onclick: () => handlers.onDoneInputs() }, [icon("check", "h-4 w-4"), "Listo"]),
      ].filter(Boolean));
    } else {
      body = inputsTable(inputs, false, handlers, usingStatement);
    }

    const headerAction = editing
      ? addButton
      : inputs.length > 0
        ? el("button", { type: "button", class: GHOST_BUTTON_CLASS, onclick: () => handlers.onEditInputs() }, [icon("edit", "h-4 w-4"), "Editar datos"])
        : addButton;

    return el("section", { class: CARD_CLASS }, [
      cardHeader("Datos de entrada", inputs.length > 0 ? `${inputs.length} ${inputs.length === 1 ? "dato" : "datos"}` : null, headerAction, helpButton(1)),
      body,
      footer,
    ].filter(Boolean));
  }

  // Datos resultantes: solo lectura, aparecen cuando una actividad produce un dato.
  #producedCard(produced) {
    const resultCard = (item, span) =>
      el("div", { class: `flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--lx-r-control)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-3 py-2.5 ${span}` }, [
        el("span", { class: `${MONO} text-[13px] font-medium text-[var(--lx-resultante-fg)]` }, item.datum.name || "(sin nombre)"),
        item.datum.type ? typeChip(item.datum.type) : null,
        el("span", { class: "ml-auto text-[12.5px] text-[var(--lx-ink-muted)]" }, item.activity),
      ].filter(Boolean));
    const rows =
      produced.length > 0
        ? el("div", { class: "grid gap-2 sm:grid-cols-2" }, produced.map((item, index) =>
            // Un número impar de resultados: el último ocupa toda la fila.
            resultCard(item, produced.length % 2 === 1 && index === produced.length - 1 ? "sm:col-span-2" : ""),
          ))
        : el("div", { class: "rounded-[var(--lx-r-panel)] border border-dashed border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)]/40 px-4 py-5 text-center text-[13px] text-[var(--lx-ink-muted)]" }, "Aparecerán aquí en cuanto una actividad produzca un dato.");

    return el("section", { class: `${CARD_CLASS} bg-[var(--lx-surface-muted)]` }, [
      cardHeader("Datos resultantes", "Los produce cada actividad", null),
      el("p", { class: "mb-3 -mt-2 text-[12.5px] text-[var(--lx-ink-muted)]" }, "No los escribes aquí: aparecen cuando una actividad produce un dato nuevo."),
      rows,
    ]);
  }
}

// Cabecera de tarjeta: título (Outfit) + subtítulo/recuento opcional, una ayuda
// discreta opcional y una acción a la derecha. Sin icono, siguiendo el diseño.
function cardHeader(title, count, action, help = null) {
  return el("div", { class: "mb-4 flex items-center gap-2" }, [
    el("h2", { class: "[font-family:var(--lx-font-display)] text-[17px] font-semibold tracking-[-0.01em] text-[var(--lx-ink)]" }, title),
    count ? el("span", { class: "text-[13px] text-[var(--lx-ink-muted)]" }, count) : null,
    help ? el("span", { class: "shrink-0" }, [help]) : null,
    action ? el("div", { class: "ml-auto" }, [action]) : null,
  ].filter(Boolean));
}

// Refuerza el concepto pedagógico: identificar un dato es transformar lo que dice
// el enunciado (lenguaje natural) en una representación con nombre para el análisis.
function transformationLegend() {
  const step = (text, tone) => el("span", { class: `rounded-[var(--lx-r-chip)] px-2 py-0.5 ${tone}` }, text);
  const arrowEl = () => el("span", { class: "text-[var(--lx-border-dashed)]" }, "→");
  return el("div", { class: "flex flex-wrap items-center gap-2 rounded-[var(--lx-r-panel)] border border-dashed border-[var(--lx-border-dashed)] px-3.5 py-2.5 text-[12.5px]" }, [
    step("Enunciado", "border border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-muted)]"),
    arrowEl(),
    step("Dato identificado", "bg-[var(--lx-surface-sunken)] text-[var(--lx-ink-body)]"),
    arrowEl(),
    step("Nombre en el análisis", `${MONO} border border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)] text-[var(--lx-entrada-fg)]`),
    el("span", { class: "text-[var(--lx-ink-muted)]" }, "· p. ej. «4 en el primer parcial» → nota1"),
  ]);
}

// Cabeceras de la tabla (nombre + nota por columna), reutilizadas por la tabla real
// y por la fila fantasma del estado vacío.
function tableHead(columns, withActions) {
  const headCells = columns.map((column) =>
    el("th", { class: `${TH_CLASS} ${column.width}`, scope: "col" }, [
      el("div", { class: "text-[11.5px] font-semibold text-[var(--lx-ink-body)]" }, column.label),
      el("div", { class: "mt-0.5 text-[11.5px] font-normal text-[var(--lx-ink-muted)]" }, column.help),
    ]),
  );
  if (withActions) headCells.push(el("th", { class: `${TH_CLASS} w-10` }, el("span", { class: "sr-only" }, "Acciones")));
  return el("thead", {}, [el("tr", {}, headCells)]);
}

// Fila fantasma del estado vacío: el ejemplo completo en gris, para ver qué va en
// cada columna sin un cartel de «no hay nada».
function ghostTable(usingStatement) {
  const columns = columnsFor(usingStatement);
  const ghost = (node) => el("td", { class: `${TD_CLASS} text-[var(--lx-ink-ghost)]` }, node);
  const source = ghost(el("span", {}, "4 en el primer parcial"));
  const value = ghost(el("span", { class: MONO }, "4"));
  const type = el("td", { class: TD_CLASS }, [el("span", { class: "inline-flex rounded-[var(--lx-r-chip)] border border-dashed border-[var(--lx-border-dashed)] px-1.5 py-0.5 text-[11px] text-[var(--lx-ink-ghost)]" }, "Numérico")]);
  const name = ghost(el("span", { class: `${MONO} font-medium` }, "nota1"));
  const cells = usingStatement ? [source, value, type, name] : [name, type, value];
  return el("div", { class: "overflow-x-auto rounded-[var(--lx-r-panel)] border border-[var(--lx-border)]" }, [
    el("table", { class: "w-full min-w-[640px] border-collapse text-[13.5px]" }, [
      tableHead(columns, false),
      el("tbody", {}, [el("tr", {}, cells)]),
    ]),
  ]);
}

// Tabla de datos de entrada; en edición las celdas tienen controles, en
// visualización muestran el valor de solo lectura.
function inputsTable(inputs, editing, handlers, usingStatement) {
  const columns = columnsFor(usingStatement);
  const rows = inputs.map((entry) => (editing ? editRow(entry, handlers, usingStatement) : viewRow(entry, usingStatement)));

  return el("div", { class: "overflow-x-auto rounded-[var(--lx-r-panel)] border border-[var(--lx-border)]" }, [
    el("table", { class: "w-full min-w-[640px] border-collapse text-[13.5px]" }, [
      tableHead(columns, editing),
      el("tbody", {}, rows),
    ]),
  ]);
}

function editRow(entry, handlers, usingStatement) {
  const change = (changes) => handlers.onInputChange(entry.id, changes);
  const nameCell = el("td", { class: TD_CLASS }, [textField("nombre", entry.name, (value) => change({ name: value }), { normalize: handlers.formatName, mono: true })]);
  const typeCell = el("td", { class: TD_CLASS }, [typeSelect(entry, handlers)]);
  const valueCell = el("td", { class: TD_CLASS }, [textField("opcional", entry.value, (value) => change({ value }), { mono: true })]);
  const cells = usingStatement
    ? [el("td", { class: TD_CLASS }, [sourceCell(entry.source)]), valueCell, typeCell, nameCell]
    : [nameCell, typeCell, valueCell];
  cells.push(
    el("td", { class: `${TD_CLASS} text-center` }, [
      el(
        "button",
        {
          type: "button",
          class: "inline-flex h-7 w-7 items-center justify-center rounded-[var(--lx-r-control)] text-[var(--lx-ink-muted)] hover:bg-[oklch(0.96_0.02_25)] hover:text-[oklch(0.55_0.15_25)]",
          title: "Eliminar dato de entrada",
          "aria-label": "Eliminar dato de entrada",
          onclick: () => handlers.onRemoveInput(entry.id),
        },
        "✕",
      ),
    ]),
  );
  return el("tr", { class: "align-middle" }, cells);
}

function viewRow(entry, usingStatement) {
  const nameCell = el("td", { class: TD_CLASS }, entry.name ? el("span", { class: `${MONO} font-medium text-[var(--lx-entrada-fg)]` }, entry.name) : dash());
  const typeCell = el("td", { class: TD_CLASS }, entry.type ? typeChip(entry.type) : dash());
  const valueCell = el("td", { class: TD_CLASS }, entry.value ? el("span", { class: `${MONO} text-[var(--lx-ink-body)]` }, entry.value) : dash());
  const cells = usingStatement
    ? [el("td", { class: TD_CLASS }, [sourceCell(entry.source)]), valueCell, typeCell, nameCell]
    : [nameCell, typeCell, valueCell];
  return el("tr", {}, cells);
}

// Celda "Dato identificado": el fragmento del enunciado, completo. "—" si no lo hay.
function sourceCell(source) {
  const text = (source ?? "").trim();
  if (!text) return dash();
  return el("span", { class: "text-[var(--lx-ink-body)]", title: "Fragmento del enunciado" }, text);
}

function dash() {
  return el("span", { class: "text-[var(--lx-ink-ghost)]" }, "—");
}

// `normalize` reformatea el campo al desenfocar (p. ej. la convención de nombres),
// sin interrumpir mientras se escribe. `mono` usa la tipografía de datos.
function textField(placeholder, value, onInput, { normalize, mono } = {}) {
  return el("input", {
    type: "text",
    value: value ?? "",
    placeholder,
    class: `${FIELD_CLASS}${mono ? ` ${MONO}` : ""}`,
    oninput: (event) => onInput(event.target.value),
    onblur: normalize ? (event) => normalizeFieldOnBlur(event, normalize, onInput) : null,
  });
}

// Selector de tipo con aspecto de ficha (chip); sigue siendo editable.
function typeSelect(entry, handlers) {
  const options = [el("option", { value: "" }, "Tipo…")];
  for (const option of optionsOf(DATA_TYPES)) {
    options.push(el("option", { value: option.value }, option.label));
  }
  const select = el(
    "select",
    {
      class: TYPE_CHIP_SELECT,
      onchange: (event) => handlers.onInputChange(entry.id, { type: event.target.value }),
    },
    options,
  );
  select.value = entry.type ?? "";
  return select;
}

// Tipo de un dato como ficha de solo lectura (Numérico/Lógico/Texto).
function typeChip(type) {
  return el("span", { class: TYPE_CHIP }, labelOf(DATA_TYPES, type));
}

// Selector de la convención de nombres del análisis. Es una regla persistente: al
// elegirla se aplica a todos los datos y se mantiene para los nuevos nombres.
function conventionSelect(nameConvention, onSetNameConvention) {
  const select = el(
    "select",
    {
      class: "rounded-[var(--lx-r-control)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-2.5 py-1.5 text-[13px] text-[var(--lx-ink-body)] outline-none focus:border-[var(--lx-violet)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)]",
      title: "Convención de nombres del análisis (se aplica a entradas y resultados)",
      onchange: (event) => onSetNameConvention(event.target.value),
    },
    [el("option", { value: "" }, "Convención: ninguna"), ...Object.entries(NAME_CONVENTIONS).map(([key, label]) => el("option", { value: key }, label))],
  );
  select.value = nameConvention ?? "";
  return select;
}
