// Identificadores únicos y estables para análisis y filas.
// Se usa crypto.randomUUID (disponible en navegadores modernos sobre http/localhost),
// de modo que la identidad de una fila no dependa de su posición visual.

export function createId() {
  return crypto.randomUUID();
}
