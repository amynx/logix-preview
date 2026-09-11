// Representación de solo lectura de una actividad (fila), compartida por la vista
// de tabla y la de tarjetas para su "modo de visualización". Construye, por cada
// campo, un nodo legible o null cuando el campo no aplica o está vacío. Solo se
// ocupa del DOM; la lógica de datos vive en el modelo.

import { el } from "../utils/dom.js";
import { BRANCH_TYPES, labelOf } from "../models/dataTypes.js";
import { expressionParts } from "../models/operators.js";
import { PENDING_ACTIVITY } from "../models/analysisModel.js";
import { typeBadge, purposeBadge, producedBadge } from "./badges.js";
import { commentBox, questionBox, formulaBox, withEquals, withArrow, referencedText } from "./cardLayout.js";
import { icon } from "./icons.js";

// Nodo de solo lectura por cada campo de la fila (o null si no aplica / vacío),
// con las mismas claves que buildRowFields para que ambas vistas lo consuman.
export function buildRowSummary(row, dataById, activities = [], producedIds = new Set(), conditions = []) {
  const resolve = (id) => dataById.get(id) ?? null;
  const resolveCondition = conditionResolver(conditions);
  const resolveName = referenceResolver(dataById, producedIds);
  const inputs = row.inputIds.map(resolve).filter(Boolean);
  const conditionText = (row.condition ?? "").trim();
  const result = row.resultId ? resolve(row.resultId) : null;

  // Una condición se resume con menos campos. Si se evalúa, además muestra el dato
  // lógico, su propósito y —como decisión— sus caminos.
  if (row.kind === "condition") {
    const evaluated = row.evaluateNow;
    const isDecisionCondition = evaluated && row.purpose === "decision";
    const showUsedIn = !evaluated || row.purpose === "operation" || row.purpose === "decision";
    return {
      conditionName: conditionNameChip(row, conditions),
      condition: conditionText ? questionBox(referencedText(conditionText, resolveName)) : null,
      operation: row.operation.length > 0 ? formulaBox(expressionNode(row.operation, resolve, resolveCondition)) : null,
      result: evaluated && result ? withEquals(dataChip(result)) : null,
      purpose: evaluated ? purposeBadge(row.purpose) : null,
      usedIn: showUsedIn ? usedInNode(row.usedInRowId, activities) : null,
      ifTrue: isDecisionCondition ? branchNode(row.ifTrue, resolve, resolveCondition) : null,
      ifFalse: isDecisionCondition ? branchNode(row.ifFalse, resolve, resolveCondition) : null,
      comment: commentText(row.subsequentUse, resolveName),
    };
  }

  // Una operación produce un dato; ya no comprueba ni tiene caminos (eso es una
  // condición). Solo necesidad, expresión, resultado, propósito, uso y comentario.
  return {
    problem: textNode(row.problem, resolveName),
    inputs: inputs.length > 0
      ? el("div", { class: "flex flex-wrap gap-1" }, inputs.map((datum) => inputChip(datum, producedIds.has(datum.id))))
      : null,
    operation: row.operation.length > 0 ? formulaBox(expressionNode(row.operation, resolve, resolveCondition)) : null,
    result: result ? withEquals(dataChip(result)) : null,
    purpose: purposeBadge(row.purpose),
    usedIn: result ? usedInNode(row.usedInRowId, activities) : null,
    comment: commentText(row.subsequentUse, resolveName),
  };
}

// True si la actividad no tiene ningún dato registrado que mostrar.
export function isSummaryEmpty(summary) {
  return Object.values(summary).every((node) => node == null);
}

// Resuelve un nombre referenciado (`[nombre]`) a un dato del catálogo, indicando si
// lo produce otra actividad, para resaltar las referencias insertadas con «/».
function referenceResolver(dataById, producedIds) {
  const byName = new Map();
  for (const datum of dataById.values()) {
    const name = (datum.name ?? "").trim();
    if (name) byName.set(name, datum);
  }
  return (name) => {
    const datum = byName.get(name);
    return datum ? { produced: producedIds.has(datum.id) } : null;
  };
}

function textNode(value, resolveName) {
  const text = (value ?? "").trim();
  return text ? el("span", { class: "whitespace-pre-wrap leading-relaxed text-slate-700" }, referencedText(text, resolveName)) : null;
}

function commentText(value, resolveName) {
  const text = (value ?? "").trim();
  return text ? commentBox(referencedText(text, resolveName)) : null;
}

function dataChip(datum) {
  return el("span", { class: "inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600" }, [
    el("span", { class: "whitespace-nowrap" }, datum.name || "(sin nombre)"),
    typeBadge(datum.type),
  ]);
}

// Ficha de un dato de entrada; si es un dato producido en otra actividad, lo marca.
function inputChip(datum, produced) {
  return el("span", { class: "inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600" }, [
    produced ? producedBadge() : null,
    el("span", { class: "whitespace-nowrap" }, datum.name || "(sin nombre)"),
    typeBadge(datum.type),
  ]);
}

// Resuelve la etiqueta de una condición referenciada: su nombre o, si no tiene,
// la etiqueta posicional (C1, C2…) según su orden entre las condiciones.
function conditionLabelOf(row, conditions) {
  const index = conditions.findIndex((candidate) => candidate.id === row.id);
  return (row.conditionName ?? "").trim() || `C${index >= 0 ? index + 1 : "?"}`;
}

function conditionResolver(conditions) {
  const labelById = new Map(conditions.map((row, index) => [row.id, (row.conditionName ?? "").trim() || `C${index + 1}`]));
  return (condId) => (labelById.has(condId) ? { label: labelById.get(condId) } : null);
}

// Ficha del nombre de una condición (etiqueta naranja con icono de bifurcación).
function conditionNameChip(row, conditions) {
  return el("span", { class: "inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700" }, [
    icon("fork", "h-3 w-3"),
    conditionLabelOf(row, conditions),
  ]);
}

// Expresión legible: los datos resaltados, los operadores y literales discretos.
function expressionNode(tokens, resolve, resolveCondition) {
  const nodes = [];
  expressionParts(tokens, resolve, resolveCondition).forEach((part, index) => {
    if (index > 0) nodes.push(" ");
    nodes.push(partNode(part));
  });
  return el("span", { class: "inline-flex flex-wrap items-center gap-1 leading-relaxed" }, nodes);
}

function partNode(part) {
  if (part.kind === "ref") {
    return el("span", { class: "whitespace-nowrap rounded bg-blue-100 px-1 py-0.5 font-medium text-blue-700" }, part.text);
  }
  if (part.kind === "cond") {
    return el("span", { class: "whitespace-nowrap rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-700" }, part.text);
  }
  if (part.kind === "op") return el("span", { class: "text-slate-400" }, part.text);
  return el("span", { class: "whitespace-nowrap rounded bg-slate-100 px-1 py-0.5 text-slate-600" }, part.text || "∅");
}

// Actividad donde se reutilizará el dato producido: pendiente (ámbar) o la
// actividad concreta asociada (índigo). Vacío si aún no se ha indicado.
export function usedInNode(usedInRowId, activities) {
  if (usedInRowId === PENDING_ACTIVITY) {
    return el("span", { class: "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700" }, "Pendiente de asignación");
  }
  const target = activities.find((activity) => activity.id === usedInRowId);
  if (!target) return null;
  return el("span", { class: "inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700" }, [
    el("span", {}, "→"),
    el("span", {}, target.label),
  ]);
}

// Camino de una decisión: "→ [opción]", donde la opción es el tipo de continuación
// y, si la hay, su respuesta. Precedido por "→" para leerse tras "entonces:".
function branchNode(branch, resolve, resolveCondition) {
  const hasValue = Array.isArray(branch.value) && branch.value.length > 0;
  const parts = [];
  if (branch.type) parts.push(el("span", { class: "text-slate-600" }, labelOf(BRANCH_TYPES, branch.type)));
  if (hasValue) {
    if (branch.type) parts.push(el("span", { class: "text-slate-300" }, "·"));
    parts.push(expressionNode(branch.value, resolve, resolveCondition));
  }
  if (parts.length === 0) parts.push(el("span", { class: "text-slate-400" }, "sin definir"));
  return withArrow(el("span", { class: "inline-flex flex-wrap items-center gap-1.5 text-slate-700" }, parts));
}
