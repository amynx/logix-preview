// Enumeraciones del análisis.
// La clave (izquierda) es el valor interno que se serializa y persiste;
// la etiqueta (derecha) es el texto que ve el estudiante en la interfaz.
// Mantenerlas juntas evita que la UI y la persistencia se desincronicen.

export const DATA_TYPES = {
  numeric: "Numérico",
  logical: "Lógico",
  text: "Texto",
};

// El propósito describe QUÉ le ocurrirá al dato resultante después: se usará en
// una nueva operación, para tomar una decisión (p. ej. una condición lo evalúa) o
// como parte de la información final. Aplica igual a operaciones y condiciones.
export const PURPOSES = {
  operation: "Usar en una nueva operación",
  decision: "Usar para tomar una decisión",
  response: "Generar la información final",
};

// Una rama de decisión ("si se cumple" / "si no se cumple") puede conducir a una
// respuesta, a una nueva operación o a otra decisión. En esta versión el detalle
// se escribe como texto; el tipo deja preparado el encadenamiento futuro.
export const BRANCH_TYPES = {
  response: "Respuesta",
  operation: "Nueva operación",
  decision: "Otra decisión",
};

// Devuelve la etiqueta visible de una clave, o cadena vacía si no está definida.
export function labelOf(map, key) {
  return map[key] ?? "";
}

// Convierte un mapa en opciones { value, label } para poblar un <select>.
export function optionsOf(map) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}
