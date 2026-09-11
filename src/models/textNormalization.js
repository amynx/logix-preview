// Normalización de texto para la presentación de campos descriptivos. Funciones
// puras (sin DOM): corrigen la forma del texto sin reescribir su contenido.

// Capitaliza la primera letra del texto sin alterar el resto. Respeta espacios,
// comillas o signos iniciales (capitaliza la primera letra que aparezca) y
// soporta acentos y ñ. Si no hay letras, devuelve el texto sin cambios.
export function capitalizeFirst(text) {
  const value = text ?? "";
  const match = value.match(/\p{L}/u);
  if (!match) return value;
  const index = match.index;
  return value.slice(0, index) + value[index].toLocaleUpperCase("es") + value.slice(index + 1);
}

// Da forma de pregunta a una condición: garantiza los signos «¿ … ?» y capitaliza
// la primera letra, sin duplicar signos ya presentes. Un texto vacío se conserva
// vacío (no fuerza «¿?»), para que un campo sin completar no parezca un error.
export function formatAsQuestion(text) {
  const core = (text ?? "")
    .trim()
    .replace(/^¿+/, "")
    .replace(/\?+$/, "")
    .trim();
  if (!core) return "";
  return `¿${capitalizeFirst(core)}?`;
}
