// Validación y migración del análisis en los límites del sistema.
// Comprueba que un objeto proveniente de un archivo sea abrible y lo actualiza al
// formato interno actual. Lanza mensajes comprensibles (no errores técnicos).

import { ANALYSIS_VERSION, PENDING_ACTIVITY, createDataEntry, findData } from "../models/analysisModel.js";
import { operationToText } from "../models/operators.js";
import { createId } from "../utils/id.js";

const INVALID_FORMAT = "El archivo seleccionado no tiene un formato de análisis válido.";

export function validateImportedAnalysis(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(INVALID_FORMAT);
  }
  const { version } = data;
  if (typeof version !== "number" || version < 1 || version > ANALYSIS_VERSION) {
    const found = version ?? "desconocida";
    throw new Error(`El archivo fue creado con una versión distinta (v${found}) y no se puede abrir en esta versión.`);
  }
  if (!Array.isArray(data.rows)) {
    throw new Error("El archivo de análisis está incompleto o dañado.");
  }
  return true;
}

// Actualiza un análisis abrible al formato actual aplicando las migraciones
// necesarias en orden. Un análisis ya en la versión actual se devuelve sin cambios.
export function migrateAnalysis(data) {
  let current = data;
  if (current.version < 2) current = migrateV1toV2(current);
  if (current.version < 3) current = migrateV2toV3(current);
  if (current.version < 4) current = migrateV3toV4(current);
  if (current.version < 5) current = migrateV4toV5(current);
  if (current.version < 6) current = migrateV5toV6(current);
  if (current.version < 7) current = migrateV6toV7(current);
  if (current.version < 8) current = migrateV7toV8(current);
  if (current.version < 9) current = migrateV8toV9(current);
  if (current.version < 10) current = migrateV9toV10(current);
  if (current.version < 11) current = migrateV10toV11(current);
  if (current.version < 12) current = migrateV11toV12(current);
  if (current.version < 13) current = migrateV12toV13(current);
  if (current.version < 14) current = migrateV13toV14(current);
  if (current.version < 15) current = migrateV14toV15(current);
  if (current.version < 16) current = migrateV15toV16(current);
  if (current.version < 17) current = migrateV16toV17(current);
  if (current.version < 18) current = migrateV17toV18(current);
  return current;
}

// v18: cada camino de una decisión puede apuntar a la actividad en la que continúa
// (`targetRowId`). Los análisis anteriores no lo declaran: se inicia sin asignar.
function migrateV17toV18(old) {
  const withTarget = (branch) => ({ targetRowId: "", ...(branch ?? {}) });
  const rows = (old.rows ?? []).map((row) => ({
    ...row,
    ifTrue: withTarget(row.ifTrue),
    ifFalse: withTarget(row.ifFalse),
  }));
  return { ...old, version: 18, rows };
}

// v17: una condición puede evaluarse en el momento (`evaluateNow`). Una decisión
// que antes era una operación pasa a ser una condición evaluada como decisión, que
// conserva sus caminos.
function migrateV16toV17(old) {
  const rows = (old.rows ?? []).map((row) => {
    const wasDecisionOperation = row.kind !== "condition" && row.purpose === "decision";
    if (wasDecisionOperation) {
      return { ...row, kind: "condition", conditionName: row.conditionName ?? "", evaluateNow: true };
    }
    return { ...row, evaluateNow: row.evaluateNow ?? false };
  });
  return { ...old, version: 17, rows };
}

// v16: las condiciones dejan de ser un catálogo aparte y pasan a ser actividades de
// tipo "condition". Las del catálogo v15 se convierten en filas-condición (mismo id,
// para que los tokens `cond` sigan resolviendo) al inicio de las actividades.
function migrateV15toV16(old) {
  const base = (row) => ({ kind: "operation", conditionName: "", ...row });
  const conditionRows = (old.conditions ?? []).map((condition) =>
    base({
      id: condition.id,
      kind: "condition",
      conditionName: "",
      operation: Array.isArray(condition.tokens) ? condition.tokens : [],
    }),
  );
  const rows = [...conditionRows, ...(old.rows ?? []).map(base)];
  const { conditions, ...rest } = old;
  return { ...rest, version: 16, rows };
}

// v15: el análisis tenía un catálogo de condiciones reutilizables (vacío si no existía).
function migrateV14toV15(old) {
  return { ...old, version: 15, conditions: Array.isArray(old.conditions) ? old.conditions : [] };
}

// v14: el análisis recuerda la convención de nombres elegida como regla persistente.
function migrateV13toV14(old) {
  return { ...old, version: 14, nameConvention: old.nameConvention ?? "" };
}

// v13: en su momento la condición pasó a ser opcional por actividad (`usesCondition`).
// Ese campo quedó obsoleto al modelar las condiciones como actividades (v16), así que
// esta migración solo eleva la versión. Los campos obsoletos que traiga un análisis
// antiguo se ignoran.
function migrateV12toV13(old) {
  return { ...old, version: 13 };
}

// v12: enunciado del problema y, en cada dato, el fragmento de origen y su valor.
function migrateV11toV12(old) {
  const data = (old.data ?? []).map((entry) => ({ ...entry, source: entry.source ?? "", value: entry.value ?? "" }));
  return { ...old, version: 12, statement: old.statement ?? "", data };
}

// v11: vuelven los estudiantes (id, nombre). El grupo sigue siendo único.
function migrateV10toV11(old) {
  return { ...old, version: 11, students: Array.isArray(old.students) ? old.students : [] };
}

// v10: la información de estudiantes se reduce al grupo. Se conserva el primer
// grupo no vacío de los estudiantes anteriores y se descarta el resto.
function migrateV9toV10(old) {
  const group = (old.students ?? []).map((student) => student?.group).find((value) => value) ?? "";
  const { students, ...rest } = old;
  return { ...rest, version: 10, group };
}

// v9: cada fila puede declarar la actividad donde se usará su dato producido.
function migrateV8toV9(old) {
  const rows = old.rows.map((row) => ({ ...row, usedInRowId: row.usedInRowId ?? "" }));
  return { ...old, version: 9, rows };
}

// v8: se añade la información de los estudiantes (vacía si no existía).
function migrateV7toV8(old) {
  return { ...old, version: 8, students: Array.isArray(old.students) ? old.students : [] };
}

// v7: el uso posterior (comentario) vuelve a texto libre. Si venía como tokens
// (v6), se deriva a su texto legible. Las ramas siguen siendo expresiones.
function migrateV6toV7(old) {
  const byId = new Map((old.data ?? []).map((entry) => [entry.id, entry]));
  const resolve = (id) => byId.get(id) ?? null;
  const rows = old.rows.map((row) => ({
    ...row,
    subsequentUse: Array.isArray(row.subsequentUse) ? operationToText(row.subsequentUse, resolve) : row.subsequentUse ?? "",
  }));
  return { ...old, version: 7, rows };
}

// v6: el uso posterior y el detalle de cada camino pasan a lista de tokens, para
// poder referenciar datos. El texto anterior se conserva como literal.
function migrateV5toV6(old) {
  const migrateBranch = (branch) => {
    const source = branch ?? { type: "", value: "" };
    return { type: source.type ?? "", value: textToTokens(source.value) };
  };
  const rows = old.rows.map((row) => ({
    ...row,
    subsequentUse: textToTokens(row.subsequentUse),
    ifTrue: migrateBranch(row.ifTrue),
    ifFalse: migrateBranch(row.ifFalse),
  }));
  return { ...old, version: 6, rows };
}

// v5: la condición vuelve a ser texto libre (la pregunta en lenguaje natural).
// Si venía como lista de tokens (v4), se deriva a su texto legible para no
// perder el contenido.
function migrateV4toV5(old) {
  const byId = new Map((old.data ?? []).map((entry) => [entry.id, entry]));
  const resolve = (id) => byId.get(id) ?? null;
  const rows = old.rows.map((row) => ({
    ...row,
    condition: Array.isArray(row.condition) ? operationToText(row.condition, resolve) : row.condition ?? "",
  }));
  return { ...old, version: 5, rows };
}

// Convierte un campo de texto libre en lista de tokens, preservando el texto
// anterior como literal para no perder el trabajo del estudiante.
function textToTokens(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? [{ kind: "literal", value: text }] : [];
}

// v4: la condición pasa de texto libre a lista de tokens (como la operación).
function migrateV3toV4(old) {
  const rows = old.rows.map((row) => ({ ...row, condition: textToTokens(row.condition) }));
  return { ...old, version: 4, rows };
}

// v3: la operación pasa de texto libre a lista de tokens. El texto anterior se
// conserva como un literal para no perder el trabajo del estudiante.
function migrateV2toV3(old) {
  const rows = old.rows.map((row) => ({ ...row, operation: textToTokens(row.operation) }));
  return { ...old, version: 3, rows };
}

// v1 tenía los datos en línea (inputs:[{name,type}], result:{name,type}). La v2
// los mueve a un catálogo con ids. Las entradas con el mismo nombre se unifican
// (incluido cuando coinciden con un resultado anterior), reconstruyendo así las
// conexiones entre filas.
function migrateV1toV2(old) {
  const catalog = [];
  const findOrCreate = (name, type) => {
    const trimmed = (name ?? "").trim();
    if (!trimmed) return null;
    let entry = catalog.find((item) => item.name === trimmed);
    if (!entry) {
      entry = createDataEntry({ name: trimmed, type: type ?? "" });
      catalog.push(entry);
    }
    return entry;
  };

  const rows = (old.rows ?? []).map((row) => {
    const inputIds = (row.inputs ?? [])
      .map((input) => findOrCreate(input.name, input.type))
      .filter(Boolean)
      .map((entry) => entry.id);

    let resultId = null;
    const result = row.result ?? {};
    if ((result.name ?? "").trim()) {
      const entry = createDataEntry({ name: result.name.trim(), type: result.type ?? "" });
      catalog.push(entry);
      resultId = entry.id;
    }

    return {
      id: row.id ?? createId(),
      problem: row.problem ?? "",
      inputIds,
      condition: row.condition ?? "",
      operation: row.operation ?? "",
      resultId,
      purpose: row.purpose ?? "",
      subsequentUse: row.subsequentUse ?? "",
      ifTrue: row.ifTrue ?? { type: "", value: "" },
      ifFalse: row.ifFalse ?? { type: "", value: "" },
    };
  });

  return { ...old, version: ANALYSIS_VERSION, data: catalog, rows };
}

// Advertencias no bloqueantes para orientar al estudiante (sección 22).
// No impiden editar ni guardar: solo señalan puntos por completar. La validación
// es pura y no depende de la interfaz.
// Advertencias de completitud (puntos por completar). Se adaptan al TIPO de
// tarjeta: una operación produce un dato; una condición descubre una comprobación
// y solo produce un dato si se evalúa. No se avisa de campos que no aplican al tipo.
// Devuelve advertencias como objetos `{ text, rowId }`: `rowId` (o null) permite
// que la vista enlace cada aviso con su actividad para saltar a ella.
export function collectAnalysisWarnings(analysis) {
  const warnings = [];
  const add = (text, rowId = null) => warnings.push({ text, rowId });
  if (!analysis.title.trim()) {
    add("El análisis no tiene título.");
  }
  // Posición (1..N) de cada actividad por id, para juzgar hacia dónde salta un camino.
  const positionById = new Map(analysis.rows.map((row, index) => [row.id, index + 1]));

  analysis.rows.forEach((row, index) => {
    const position = index + 1;
    const isCondition = row.kind === "condition";
    const label = isCondition ? "Condición" : "Actividad";
    const result = findData(analysis, row.resultId);
    // Solo produce un dato una operación o una condición que se evalúa.
    const producesDatum = !isCondition || row.evaluateNow;

    if (producesDatum && row.operation.length > 0 && !(result && result.name.trim())) {
      const what = isCondition ? "la condición evaluada" : "la operación";
      add(`${label} ${position}: ${what} produce un dato sin nombre.`, row.id);
    }
    if (result && result.name.trim() && !result.type) {
      add(`${label} ${position}: el dato "${result.name}" no tiene tipo.`, row.id);
    }

    if (isCondition) {
      // Una condición que ya se está definiendo necesita su comprobación.
      if (((row.conditionName ?? "").trim() || row.condition.trim()) && row.operation.length === 0) {
        add(`Condición ${position}: no tiene una comprobación definida.`, row.id);
      }
      // Una condición evaluada como decisión debe definir al menos un camino.
      if (row.evaluateNow && row.purpose === "decision" && !row.ifTrue.type && !row.ifFalse.type) {
        add(`Condición ${position}: la decisión no define ningún camino.`, row.id);
      }
      // Coherencia del destino de cada camino que continúa: no debe volver a la
      // propia condición ni a una actividad anterior (posibles bucles), ni apuntar
      // a una actividad inexistente. «Pendiente» y sin asignar son estados válidos.
      if (row.evaluateNow && row.purpose === "decision") {
        for (const [branchCase, branch] of [["Sí", row.ifTrue], ["No", row.ifFalse]]) {
          const target = branch.targetRowId;
          const continues = branch.type === "operation" || branch.type === "decision";
          if (!continues || !target || target === PENDING_ACTIVITY) continue;
          if (target === row.id) {
            add(`Condición ${position}: el camino «${branchCase}» vuelve a esta misma condición (bucle).`, row.id);
          } else if (!positionById.has(target)) {
            add(`Condición ${position}: el camino «${branchCase}» continúa en una actividad que ya no existe.`, row.id);
          } else if (positionById.get(target) <= position) {
            add(`Condición ${position}: el camino «${branchCase}» continúa en una actividad anterior (posible bucle).`, row.id);
          }
        }
      }
    }

    if (row.purpose === "response" && !row.resultId && !row.subsequentUse.trim()) {
      add(`${label} ${position}: falta indicar qué información final se proporcionará.`, row.id);
    }
  });

  // El análisis solo está completo cuando produce una información final: mientras no
  // haya ninguna salida (un propósito «respuesta» o un camino de respuesta), queda
  // pendiente aunque las actividades individuales estén bien.
  if (analysis.rows.length > 0 && !producesFinalOutput(analysis)) {
    add("El análisis todavía no genera una información final (elige «Generar la información final» o define un camino de respuesta).");
  }

  return warnings;
}

// Hay salida si alguna actividad tiene propósito «respuesta» o algún camino de una
// decisión termina en una respuesta (coincide con las salidas de la cadena).
function producesFinalOutput(analysis) {
  return analysis.rows.some(
    (row) =>
      row.purpose === "response" ||
      (row.ifTrue?.type === "response" && (row.ifTrue.value?.length ?? 0) > 0) ||
      (row.ifFalse?.type === "response" && (row.ifFalse.value?.length ?? 0) > 0),
  );
}
