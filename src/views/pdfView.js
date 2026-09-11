// Vista de exportación a PDF. Renderiza en un área de impresión oculta solo las
// secciones seleccionadas y usa la impresión nativa del navegador (Guardar como
// PDF), sin dependencias externas. La información de los estudiantes y la fecha y
// hora de exportación se incluyen según la selección; la fecha es automática.

import { el, clear } from "../utils/dom.js";
import { DATA_TYPES, PURPOSES, BRANCH_TYPES, labelOf } from "../models/dataTypes.js";
import { operationToText } from "../models/operators.js";
import { buildChain } from "../models/chainModel.js";
import { PENDING_ACTIVITY } from "../models/analysisModel.js";

// Secciones que el usuario puede incluir o excluir (todas marcadas por defecto).
export const PDF_SECTIONS = [
  { key: "students", label: "Información de los estudiantes" },
  { key: "table", label: "Tabla de datos" },
  { key: "chain", label: "Cadena de análisis (entradas)" },
  { key: "process", label: "Proceso" },
  { key: "output", label: "Resultados o salida" },
];

export class PdfView {
  constructor({ container }) {
    this.container = container;
  }

  render(analysis, options) {
    renderForPrint(this.container, analysis, options);
  }

  // Renderiza el contenido y abre el diálogo de impresión del navegador. El PDF se
  // imprime siempre en claro, aunque la interfaz esté en modo oscuro.
  print(analysis, options) {
    this.render(analysis, options);
    document.body.classList.add("printing");
    const wasDark = document.documentElement.classList.contains("dark");
    if (wasDark) document.documentElement.classList.remove("dark");
    // El navegador propone el nombre del PDF a partir de `document.title`: se fija uno
    // descriptivo (análisis · grupo · integrantes con su identificación) y se restaura.
    const previousTitle = document.title;
    document.title = pdfDocumentTitle(analysis);
    const cleanup = () => {
      document.body.classList.remove("printing");
      if (wasDark) document.documentElement.classList.add("dark");
      document.title = previousTitle;
      clear(this.container);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }
}

// Nombre sugerido para el PDF guardado: título del análisis, grupo y la lista de
// integrantes con su identificación. Sustituye al título genérico de la página.
export function pdfDocumentTitle(analysis) {
  const clean = (value) => (value ?? "").trim();
  const members = (analysis.students ?? [])
    .map((student) => [clean(student.fullName), clean(student.idNumber)].filter(Boolean).join(" "))
    .filter(Boolean);
  const parts = [clean(analysis.title), clean(analysis.group), members.join(", ")].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Análisis Logix";
}

function renderForPrint(container, analysis, { sections, exportedAt }) {
  clear(container);
  const has = (key) => sections.includes(key);
  const dataById = new Map(analysis.data.map((entry) => [entry.id, entry]));
  const resolve = (id) => dataById.get(id) ?? null;

  const blocks = [printHeader(analysis, exportedAt)];
  if (has("students")) blocks.push(studentsBlock(analysis.group, analysis.students));
  if (has("table")) blocks.push(tableBlock(analysis, resolve));

  if (has("chain") || has("process") || has("output")) {
    const chain = buildChain(analysis);
    if (has("chain")) blocks.push(chainInputsBlock(chain));
    if (has("process")) blocks.push(processBlock(chain));
    if (has("output")) blocks.push(outputBlock(chain));
  }

  container.append(el("div", { class: "space-y-6 p-8 text-sm text-slate-900" }, blocks));
}

function printHeader(analysis, exportedAt) {
  return el("div", { class: "border-b border-slate-300 pb-3" }, [
    el("h1", { class: "text-xl font-semibold" }, analysis.title || "Análisis sin título"),
    analysis.description ? el("p", { class: "mt-1 text-slate-600" }, analysis.description) : null,
    analysis.statement ? el("p", { class: "mt-2 whitespace-pre-wrap text-sm text-slate-700" }, [el("span", { class: "font-medium" }, "Enunciado: "), analysis.statement]) : null,
    el("p", { class: "mt-1 text-xs text-slate-500" }, `Exportado: ${formatDateTime(exportedAt)}`),
  ]);
}

function sectionTitle(text) {
  return el("h2", { class: "mb-2 text-base font-semibold text-slate-800" }, text);
}

function studentsBlock(group, students) {
  const rows = students.map((s) => el("tr", {}, [td(s.idNumber), td(s.fullName)]));
  return el("div", {}, [
    sectionTitle("Información de los estudiantes"),
    el("p", { class: "mb-2 text-slate-700" }, [el("span", { class: "font-medium" }, "Grupo: "), group || "—"]),
    students.length > 0
      ? printableTable(["N.º de identificación", "Nombre completo"], rows)
      : el("p", { class: "text-slate-500" }, "Sin estudiantes registrados."),
  ]);
}

function tableBlock(analysis, resolve) {
  const resolveCondition = conditionResolver(analysis);
  const conditionLabelOf = (row) => resolveCondition(row.id)?.label ?? "";
  const inputsText = (row) =>
    row.inputIds.map((id) => resolve(id)).filter(Boolean).map(dataLabel).join(", ");
  const resultText = (row) => (row.resultId ? dataLabel(resolve(row.resultId)) : "");
  const branchText = (branch) =>
    [branch.type ? labelOf(BRANCH_TYPES, branch.type) : "", operationToText(branch.value, resolve, resolveCondition)]
      .filter(Boolean)
      .join(": ");
  const activityLabelById = new Map(analysis.rows.map((row, index) => [row.id, `Actividad ${index + 1}`]));
  const usedInText = (row) => {
    if (!row.usedInRowId) return "";
    if (row.usedInRowId === PENDING_ACTIVITY) return "Pendiente de asignación";
    return activityLabelById.get(row.usedInRowId) ?? "";
  };

  // Una condición muestra su nombre y pregunta; una operación, su necesidad. El
  // propósito y los caminos solo aplican donde corresponde a cada tipo.
  const rows = analysis.rows.map((row, index) => {
    const isCondition = row.kind === "condition";
    const producesDatum = !isCondition || row.evaluateNow;
    return el("tr", {}, [
      td(String(index + 1)),
      td(isCondition ? "Condición" : "Operación"),
      td(isCondition ? conditionLabelOf(row) : row.problem),
      td(isCondition ? row.condition : ""),
      td(operationToText(row.operation, resolve, resolveCondition)),
      td(producesDatum ? resultText(row) : ""),
      td(producesDatum ? labelOf(PURPOSES, row.purpose) : ""),
      td(usedInText(row)),
      td(row.subsequentUse),
      td(branchText(row.ifTrue)),
      td(branchText(row.ifFalse)),
    ]);
  });

  return el("div", {}, [
    sectionTitle("Tabla de datos"),
    printableTable(
      ["#", "Tipo", "Necesidad / Nombre", "Pregunta", "Expresión", "Dato resultante", "Propósito", "Se usa en", "Comentario", "Si se cumple", "Si no se cumple"],
      rows,
    ),
  ]);
}

// Resuelve el id de una fila-condición a su etiqueta (nombre o Cn), para el PDF.
function conditionResolver(analysis) {
  const labels = new Map(
    analysis.rows.filter((row) => row.kind === "condition").map((row, index) => [row.id, (row.conditionName ?? "").trim() || `C${index + 1}`]),
  );
  return (id) => (labels.has(id) ? { label: labels.get(id) } : null);
}

function chainInputsBlock(chain) {
  return el("div", {}, [
    sectionTitle("Cadena de análisis — Entradas"),
    labelledList("Datos que recibe el programa", chain.entradas.map(dataLabel)),
    chain.producidos.length > 0 ? labelledList("Datos producidos", chain.producidos.map(dataLabel)) : null,
  ]);
}

function processBlock(chain) {
  const cards = chain.proceso.map((step) => processCard(step));
  return el("div", {}, [
    sectionTitle("Proceso"),
    cards.length > 0 ? el("div", { class: "space-y-2" }, cards) : el("p", { class: "text-slate-500" }, "Sin actividades."),
  ]);
}

function processCard(step) {
  const isCondition = step.kind === "condition";
  const lines = [];
  const add = (label, value) => value && lines.push(el("div", {}, [strong(`${label}: `), value]));

  if (isCondition) {
    add("Pregunta", step.condition);
    add("Comprobación", partsText(step.operation));
    if (step.evaluateNow) {
      add("Dato lógico", step.result ? dataLabel(step.result) : "");
      add("Propósito", labelOf(PURPOSES, step.purpose));
      if (step.purpose === "decision") {
        add("Si se cumple", branchLine(step.ifTrue));
        add("Si no se cumple", branchLine(step.ifFalse));
      }
    }
    add("Comentario", step.comment);
  } else {
    add("Entradas", step.inputs.map(dataLabel).join(", "));
    add("Operación", partsText(step.operation));
    add("Resultado", step.result ? dataLabel(step.result) : "");
    add("Propósito", labelOf(PURPOSES, step.purpose));
    add("Comentario", step.comment);
  }

  const title = isCondition ? `#${step.position} · Condición: ${step.conditionLabel}` : `#${step.position} ${step.description}`.trim();
  return el("div", { class: `rounded border p-2 ${isCondition ? "border-amber-300 bg-amber-50/40" : "border-slate-300"}` }, [
    el("div", { class: "font-medium" }, title),
    el("div", { class: "mt-1 space-y-0.5 text-slate-700" }, lines),
  ]);
}

function outputBlock(chain) {
  const items = chain.salidas.map((output) =>
    el("li", {}, [
      output.branch ? strong(`[${output.branch}] `) : null,
      partsText(output.parts),
      output.condition ? el("span", { class: "text-slate-500" }, ` — cuando: ${output.condition}`) : null,
    ]),
  );
  return el("div", {}, [
    sectionTitle("Resultados o salida"),
    items.length > 0 ? el("ul", { class: "list-disc pl-5" }, items) : el("p", { class: "text-slate-500" }, "Sin salidas."),
  ]);
}

// --- Ayudas ---

function printableTable(headers, rows) {
  return el("table", { class: "w-full border-collapse text-xs" }, [
    el("thead", {}, [el("tr", {}, headers.map((h) => el("th", { class: "border border-slate-400 bg-slate-100 px-1.5 py-1 text-left" }, h)))]),
    el("tbody", {}, rows),
  ]);
}

function td(text) {
  return el("td", { class: "border border-slate-300 px-1.5 py-1 align-top" }, text || "");
}

function labelledList(label, values) {
  return el("div", { class: "mb-2" }, [
    strong(`${label}: `),
    values.length > 0 ? values.join(" · ") : el("span", { class: "text-slate-500" }, "—"),
  ]);
}

function strong(text) {
  return el("span", { class: "font-medium" }, text);
}

function dataLabel(datum) {
  return `${datum.name || "(sin nombre)"} : ${labelOf(DATA_TYPES, datum.type) || "—"}`;
}

function partsText(parts) {
  return parts.map((part) => part.text).join(" ");
}

function branchLine(branch) {
  const type = branch.type ? labelOf(BRANCH_TYPES, branch.type) : "";
  const body = partsText(branch.parts);
  // Si el camino continúa en una actividad concreta, se nombra el destino.
  const target = branch.flow === "continúa" && branch.targetLabel ? branch.targetLabel : "";
  const detail = body || target;
  return [type, detail].filter(Boolean).join(detail ? " · " : "");
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
