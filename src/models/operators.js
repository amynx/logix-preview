// Operadores disponibles para construir operaciones, agrupados por tipo, y la
// derivación de una operación (lista de tokens) a texto legible.
//
// Una operación es una lista ordenada de tokens:
//   { kind: "ref", dataId }              → referencia a un dato del catálogo
//   { kind: "op", op }                   → operador (clave de OPERATOR_SYMBOLS)
//   { kind: "literal", value }           → valor fijo escrito por el estudiante
//
// Referenciar datos (en vez de reescribir su nombre) evita inconsistencias y
// permite reutilizar entradas y resultados a lo largo del análisis.

export const OPERATOR_GROUPS = {
  arithmetic: { label: "Aritméticos", operators: { add: "+", sub: "−", mul: "×", div: "÷" } },
  relational: { label: "Relacionales", operators: { eq: "=", ne: "≠", lt: "<", gt: ">", le: "≤", ge: "≥" } },
  logical: { label: "Lógicos", operators: { and: "Y", or: "O", not: "NO" } },
  grouping: { label: "Agrupación", operators: { lparen: "(", rparen: ")" } },
};

export const OPERATOR_SYMBOLS = Object.values(OPERATOR_GROUPS).reduce(
  (symbols, group) => Object.assign(symbols, group.operators),
  {},
);

// Descompone una expresión en partes tipadas para presentarla resaltando los
// datos. Cada parte: { kind: "ref"|"op"|"literal", text, type? } — para "ref",
// `type` es el tipo del dato (o "" si el dato ya no existe). `resolve` mapea un id
// de dato a su entrada del catálogo.
export function expressionParts(tokens, resolve, resolveCondition) {
  if (!Array.isArray(tokens)) return [];
  return tokens.map((token) => {
    if (token.kind === "ref") {
      const datum = resolve(token.dataId);
      return { kind: "ref", text: datum ? datum.name || "(sin nombre)" : "?", type: datum?.type ?? "" };
    }
    if (token.kind === "op") return { kind: "op", text: OPERATOR_SYMBOLS[token.op] ?? "?" };
    if (token.kind === "cond") {
      const condition = resolveCondition ? resolveCondition(token.condId) : null;
      return { kind: "cond", text: condition ? condition.label : "?", type: "logical" };
    }
    return { kind: "literal", text: token.value ?? "" };
  });
}

// Texto legible de una expresión (une las partes con espacios).
export function operationToText(tokens, resolve, resolveCondition) {
  return expressionParts(tokens, resolve, resolveCondition)
    .map((part) => part.text)
    .join(" ");
}

const ARITHMETIC_OPS = Object.keys(OPERATOR_GROUPS.arithmetic.operators);
const BOOLEAN_OPS = [
  ...Object.keys(OPERATOR_GROUPS.relational.operators),
  ...Object.keys(OPERATOR_GROUPS.logical.operators),
];

// Sugerencia de tipo para el dato resultante según los operadores de la
// operación: relacionales/lógicos → "logical"; aritméticos → "numeric".
// Devuelve null si no hay operadores significativos (no hay nada que sugerir).
export function inferResultType(tokens) {
  const ops = (tokens ?? [])
    .filter((token) => token.kind === "op")
    .map((token) => token.op)
    .filter((op) => ARITHMETIC_OPS.includes(op) || BOOLEAN_OPS.includes(op));
  if (ops.length === 0) return null;
  return ops.some((op) => BOOLEAN_OPS.includes(op)) ? "logical" : "numeric";
}
