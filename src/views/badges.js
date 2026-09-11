// Insignias con color para reconocer de un vistazo tipos de dato y propósitos.

import { el } from "../utils/dom.js";
import { DATA_TYPES, PURPOSES, labelOf } from "../models/dataTypes.js";
import { icon } from "./icons.js";

const TYPE_STYLE = {
  numeric: { symbol: "#", cls: "bg-blue-100 text-blue-700" },
  logical: { symbol: "✓", cls: "bg-purple-100 text-purple-700" },
  text: { symbol: "Aa", cls: "bg-emerald-100 text-emerald-700" },
};

const PURPOSE_STYLE = {
  operation: "bg-blue-100 text-blue-700",
  decision: "bg-amber-100 text-amber-700",
  response: "bg-emerald-100 text-emerald-700",
};

// Insignia del tipo de un dato: símbolo + color (con el nombre del tipo en el title).
export function typeBadge(type) {
  const style = TYPE_STYLE[type] ?? { symbol: "·", cls: "bg-slate-100 text-slate-400" };
  return el(
    "span",
    { class: `inline-flex h-4 items-center rounded px-1 text-[10px] font-semibold ${style.cls}`, title: labelOf(DATA_TYPES, type) || "Sin tipo" },
    style.symbol,
  );
}

// Ficha de un dato: nombre + insignia de tipo. `extraClass` ajusta el contenedor.
export function dataChip(datum, extraClass = "rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700") {
  return el("span", { class: `inline-flex items-center gap-1.5 ${extraClass}` }, [
    el("span", { class: "truncate" }, datum.name || "(sin nombre)"),
    typeBadge(datum.type),
  ]);
}

// Marca un dato de entrada que en realidad se produjo en otra actividad (dato
// intermedio reutilizado), para distinguirlo de una entrada declarada del programa.
export function producedBadge() {
  const badge = icon("reuse", "h-3.5 w-3.5 text-emerald-500");
  badge.setAttribute("title", "Producido en otra actividad");
  return badge;
}

// Insignia del propósito de una actividad, con color por tipo de propósito.
export function purposeBadge(purpose) {
  if (!purpose) return null;
  return el(
    "span",
    { class: `rounded-full px-2 py-0.5 text-[11px] font-medium ${PURPOSE_STYLE[purpose] ?? "bg-slate-100 text-slate-500"}` },
    labelOf(PURPOSES, purpose),
  );
}
