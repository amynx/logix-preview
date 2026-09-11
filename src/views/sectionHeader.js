// Encabezado de sección con icono. El progreso numerado vive ahora en el paso
// superior por etapas (stageNav), así que aquí no se repite el número.

import { el } from "../utils/dom.js";
import { icon } from "./icons.js";

// Estado vacío amable: un icono tenue y un texto de ayuda.
export function emptyState(iconName, text) {
  return el("div", { class: "flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-6 text-center" }, [
    el("span", { class: "text-slate-300" }, [icon(iconName, "h-7 w-7")]),
    el("p", { class: "text-sm text-slate-400" }, text),
  ]);
}

export function sectionHeader({ title, subtitle, iconName, trailing, help }) {
  return el("div", { class: "mb-3 flex items-center gap-2.5" }, [
    el("span", { class: "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500" }, [icon(iconName, "h-5 w-5")]),
    el("div", { class: "min-w-0" }, [
      el("h2", { class: "text-sm font-semibold text-slate-800" }, title),
      subtitle ? el("p", { class: "text-xs text-slate-400" }, subtitle) : null,
    ]),
    help ? el("div", { class: "shrink-0" }, [help]) : null,
    trailing ? el("div", { class: "ml-auto" }, [trailing]) : null,
  ]);
}
