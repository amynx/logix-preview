// Derivación pura del análisis a su "cadena" de razonamiento:
// Entradas → Proceso (actividades) → Salida.
// No depende del DOM: transforma el estado en una estructura lista para la vista,
// reutilizando la identidad por id para distinguir datos externos, intermedios y
// finales. Es la base para futuras representaciones (pseudocódigo, diagramas).

import { expressionParts } from "./operators.js";

// Un camino de decisión continúa el proceso (nueva operación/otra decisión) o lo
// finaliza (una respuesta). Sirve para representar la bifurcación.
function branchFlow(type) {
  if (type === "response") return "finaliza";
  return type ? "continúa" : null;
}

export function buildChain(analysis) {
  const dataById = new Map(analysis.data.map((entry) => [entry.id, entry]));
  const resolve = (id) => dataById.get(id) ?? null;
  // Etiquetas de cada actividad por id, para nombrar hacia dónde continúa un camino
  // de decisión: una corta («Actividad N») para el chip y una completa («Actividad
  // N · detalle») para el título/tooltip.
  const activityShortById = new Map(analysis.rows.map((row, index) => [row.id, `Actividad ${index + 1}`]));
  const activityLabelById = new Map(
    analysis.rows.map((row, index) => {
      const detail = resolve(row.resultId)?.name || row.problem.trim() || (row.conditionName ?? "").trim();
      return [row.id, detail ? `Actividad ${index + 1} · ${detail}` : `Actividad ${index + 1}`];
    }),
  );
  const conditionLabels = new Map(
    analysis.rows.filter((row) => row.kind === "condition").map((row, index) => [row.id, (row.conditionName ?? "").trim() || `C${index + 1}`]),
  );
  const resolveCondition = (condId) => (conditionLabels.has(condId) ? { label: conditionLabels.get(condId) } : null);
  const producedIds = new Set(analysis.rows.map((row) => row.resultId).filter(Boolean));

  return {
    entradas: collectInputs(analysis, producedIds),
    // Proceso = todas las actividades (operaciones y condiciones) en el orden del
    // análisis; cada una se representa como una tarjeta con su detalle.
    proceso: analysis.rows
      .map((row, index) => buildStep(row, index, resolve, producedIds, resolveCondition, activityLabelById, activityShortById))
      .filter(Boolean),
    producidos: collectProduced(analysis, resolve),
    salidas: collectOutputs(analysis, resolve, resolveCondition),
  };
}

// Datos producidos por las operaciones, en orden y sin repetir. Quedan
// disponibles para identificarse y reutilizarse en operaciones posteriores.
function collectProduced(analysis, resolve) {
  const produced = [];
  const seen = new Set();
  for (const row of analysis.rows) {
    if (row.resultId && !seen.has(row.resultId)) {
      const datum = resolve(row.resultId);
      if (datum) {
        produced.push(datum);
        seen.add(row.resultId);
      }
    }
  }
  return produced;
}

// Entradas del programa: los datos de entrada declarados (los del catálogo que
// ninguna operación produce).
function collectInputs(analysis, producedIds) {
  return analysis.data.filter((entry) => !producedIds.has(entry.id));
}

// Una actividad por fila con contenido, en el orden del análisis. Se expone cada
// parte por separado para que la tarjeta la presente de forma organizada.
function buildStep(row, index, resolve, producedIds, resolveCondition, activityLabelById = new Map(), activityShortById = new Map()) {
  const isCondition = row.kind === "condition";
  const inputs = row.inputIds
    .map(resolve)
    .filter(Boolean)
    .map((datum) => ({ ...datum, produced: producedIds.has(datum.id) }));
  const result = resolve(row.resultId);
  const operation = expressionParts(row.operation, resolve, resolveCondition);
  const condition = row.condition.trim();
  const description = row.problem.trim();
  const conditionLabel = isCondition ? (resolveCondition(row.id)?.label ?? "?") : null;

  const hasContent = isCondition
    ? Boolean(condition || operation.length > 0 || (row.conditionName ?? "").trim())
    : Boolean(description || operation.length > 0 || condition || result || inputs.length > 0 || row.purpose);
  if (!hasContent) return null;

  const path = (branch) => {
    // Actividad concreta en la que continúa el camino (si se asignó una existente,
    // no «pendiente»): su id sirve para trazar el salto, su etiqueta para nombrarlo.
    const target = branch.targetRowId && activityLabelById.has(branch.targetRowId) ? branch.targetRowId : null;
    return {
      type: branch.type,
      flow: branchFlow(branch.type),
      parts: expressionParts(branch.value, resolve, resolveCondition),
      target,
      targetLabel: target ? activityLabelById.get(target) : null,
      targetShort: target ? activityShortById.get(target) : null,
    };
  };

  return {
    rowId: row.id,
    position: index + 1,
    kind: row.kind,
    conditionLabel,
    evaluateNow: row.evaluateNow,
    description,
    inputs,
    condition,
    operation,
    result,
    purpose: row.purpose,
    usedInRowId: row.usedInRowId,
    comment: row.subsequentUse.trim(),
    // Caminos de la decisión (para visualizar cómo la condición afecta el flujo).
    ifTrue: path(row.ifTrue),
    ifFalse: path(row.ifFalse),
  };
}

// Deriva la cadena a un ÁRBOL de flujo para dividirla en caminos reales. Se recorre
// desde la primera actividad: las actividades no-decisión encadenan a la siguiente
// (en orden); una decisión se bifurca en sus caminos «Sí»/«No», y cada camino o
// finaliza (respuesta), o continúa en su actividad destino, o queda pendiente. Un
// conjunto de visitados global evita bucles y duplicados: reencontrar una actividad
// ya mostrada produce un nodo `ref` (marcador «vuelve a…») en vez de re-expandirla.
// Devuelve `{ root, orphans }`; `orphans` son actividades no alcanzadas por el flujo.
export function buildFlowTree(chain) {
  const proceso = chain.proceso ?? [];
  const byId = new Map(proceso.map((step) => [step.rowId, step]));
  const indexById = new Map(proceso.map((step, index) => [step.rowId, index]));
  const visited = new Set();
  const isDecision = (step) => step.kind === "condition" && step.evaluateNow && step.purpose === "decision";

  const outcome = (path, branchCase) => {
    if (path.flow === "finaliza") return { branchCase, kind: "final", parts: path.parts };
    if (path.flow === "continúa") {
      const target = path.target ? byId.get(path.target) : null;
      return target ? { branchCase, kind: "continue", node: build(target) } : { branchCase, kind: "pending" };
    }
    return { branchCase, kind: "undefined" };
  };

  function build(step) {
    if (!step) return null;
    if (visited.has(step.rowId)) return { type: "ref", step };
    visited.add(step.rowId);
    if (isDecision(step)) {
      return { type: "decision", step, branches: [outcome(step.ifTrue, "Sí"), outcome(step.ifFalse, "No")] };
    }
    const index = indexById.get(step.rowId);
    const next = index != null && index + 1 < proceso.length ? build(proceso[index + 1]) : null;
    return { type: "activity", step, next };
  }

  const root = proceso.length > 0 ? build(proceso[0]) : null;
  const orphans = proceso.filter((step) => !visited.has(step.rowId));
  return { root, orphans };
}

// Salidas: la información final del programa (propósito "respuesta") y las ramas
// de decisión que terminan en una respuesta. Cada salida de una rama indica a qué
// caso corresponde (Sí = la condición se cumple; No = no se cumple) y la pregunta.
function collectOutputs(analysis, resolve, resolveCondition) {
  const outputs = [];
  for (const row of analysis.rows) {
    if (row.purpose === "response") {
      const result = resolve(row.resultId);
      const comment = row.subsequentUse.trim();
      const parts = result
        ? [{ kind: "ref", text: result.name || "(sin nombre)", type: result.type }]
        : comment
          ? [{ kind: "literal", text: comment }]
          : [{ kind: "literal", text: "Respuesta" }];
      outputs.push({ parts, branch: null, condition: "" });
    }
    // En la información final se identifica la condición por su nombre (más breve
    // que la pregunta); si aún no tiene nombre, se recurre a la pregunta.
    const condition = (row.conditionName ?? "").trim() || row.condition.trim();
    for (const [branchCase, branch] of [["Sí", row.ifTrue], ["No", row.ifFalse]]) {
      if (branch.type === "response" && branch.value.length > 0) {
        outputs.push({ parts: expressionParts(branch.value, resolve, resolveCondition), branch: branchCase, condition });
      }
    }
  }
  return outputs;
}
