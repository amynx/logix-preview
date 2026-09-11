// Indicador de completitud en vivo: muestra los puntos por completar del análisis
// (o confirma que está completo). No bloquea nada; solo orienta al estudiante.
// Solo se ocupa del DOM; recibe la lista de advertencias ya calculada.

import { el, clear } from "../utils/dom.js";
import { icon } from "./icons.js";

export class CompletenessView {
  constructor({ container }) {
    this.container = container;
  }

  // `warnings`: [{ text, rowId }]. `handlers.onFocusActivity(rowId)` (opcional) hace
  // que un aviso con actividad sea accionable: al pulsarlo, se salta a esa tarjeta.
  render(warnings, handlers = {}) {
    clear(this.container);

    // Sin pendientes no se muestra nada: que el análisis está completo lo comunican
    // el paso «Cadena» (que se marca ✓ solo cuando hay una salida) y el bloque de
    // información final. Un banner aquí solo añadía ruido.
    if (warnings.length === 0) return;

    const item = (warning) => {
      if (warning.rowId && handlers.onFocusActivity) {
        return el("li", {}, [
          el(
            "button",
            {
              type: "button",
              class: "text-left underline decoration-amber-300 underline-offset-2 hover:decoration-amber-600",
              title: "Ir a esta actividad",
              onclick: () => handlers.onFocusActivity(warning.rowId),
            },
            warning.text,
          ),
        ]);
      }
      return el("li", {}, warning.text);
    };

    this.container.append(
      el("div", { class: "rounded-xl border border-amber-200 bg-amber-50 p-4" }, [
        el("div", { class: "mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800" }, [
          icon("alert", "h-4 w-4"),
          `Por completar (${warnings.length})`,
        ]),
        el("ul", { class: "list-disc space-y-1 pl-5 text-sm text-amber-800" }, warnings.map(item)),
      ]),
    );
  }
}
