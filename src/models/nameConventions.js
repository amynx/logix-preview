// Convenciones para nombrar variables. Puramente funcionales: convierten un
// nombre legible ("unidades producidas") a la convención elegida. No deciden por
// el estudiante; solo aplican la convención que él solicita.

// Clave interna → etiqueta visible.
export const NAME_CONVENTIONS = {
  camel: "camelCase",
  snake: "snake_case",
  pascal: "PascalCase",
};

// Separa un nombre en palabras (por espacios, guiones, guion bajo y límites de
// camelCase), conservando los acentos.
function words(name) {
  return String(name ?? "")
    .trim()
    .replace(/([a-z0-9])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
}

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

// Aplica una convención a un nombre. Un nombre vacío se devuelve sin cambios.
export function applyNameConvention(name, convention) {
  const parts = words(name).map((word) => word.toLowerCase());
  if (parts.length === 0) return name ?? "";
  switch (convention) {
    case "camel":
      return parts[0] + parts.slice(1).map(capitalize).join("");
    case "pascal":
      return parts.map(capitalize).join("");
    case "snake":
      return parts.join("_");
    default:
      return name ?? "";
  }
}
