// Diálogos modales construidos con HTML + Tailwind. Se evita el elemento nativo
// <dialog> para mantener un comportamiento uniforme y fácil de probar.

import { el } from "../utils/dom.js";

// Diálogo para elegir qué secciones incluir en una exportación. Recibe la lista
// { key, label } (todas marcadas por defecto) y resuelve con las claves elegidas,
// o null si se cancela.
export function selectSectionsDialog(sections, { title, confirmLabel = "Generar PDF" }) {
  return new Promise((resolve) => {
    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    const checks = sections.map((section) => {
      const input = el("input", { type: "checkbox", class: "h-4 w-4" });
      input.checked = true;
      input.dataset.key = section.key;
      return el("label", { class: "flex items-center gap-2 text-sm text-slate-700" }, [input, section.label]);
    });

    const confirm = el(
      "button",
      {
        type: "button",
        class: "rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900",
        onclick: () => {
          const selected = checks
            .map((label) => label.querySelector("input"))
            .filter((input) => input.checked)
            .map((input) => input.dataset.key);
          close(selected);
        },
      },
      confirmLabel,
    );

    const overlay = el(
      "div",
      {
        class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4",
        onclick: (event) => {
          if (event.target === overlay) close(null);
        },
      },
      [
        el("div", { class: "dialog-enter w-full max-w-sm rounded-lg bg-white p-5 shadow-xl", role: "dialog", "aria-modal": "true" }, [
          el("h2", { class: "text-base font-semibold text-slate-900" }, title),
          el("p", { class: "mt-1 text-xs text-slate-500" }, "Marca las secciones que quieres incluir."),
          el("div", { class: "mt-3 space-y-2" }, checks),
          el("div", { class: "mt-5 flex justify-end gap-2" }, [
            el(
              "button",
              {
                type: "button",
                class: "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50",
                onclick: () => close(null),
              },
              "Cancelar",
            ),
            confirm,
          ]),
        ]),
      ],
    );

    document.body.append(overlay);
  });
}

// Muestra un mensaje informativo con un único botón de aceptar. Devuelve una
// promesa que se resuelve al cerrarlo. Útil para errores comprensibles al usuario.
export function messageDialog({ title, message, acceptLabel = "Entendido" }) {
  return new Promise((resolve) => {
    const close = () => {
      overlay.remove();
      resolve();
    };

    const acceptButton = el(
      "button",
      {
        type: "button",
        class: "rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900",
        onclick: close,
      },
      acceptLabel,
    );

    const overlay = el(
      "div",
      {
        class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4",
        onclick: (event) => {
          if (event.target === overlay) close();
        },
      },
      [
        el("div", { class: "dialog-enter w-full max-w-sm rounded-lg bg-white p-5 shadow-xl", role: "dialog", "aria-modal": "true" }, [
          el("h2", { class: "text-base font-semibold text-slate-900" }, title),
          el("p", { class: "mt-2 text-sm text-slate-600" }, message),
          el("div", { class: "mt-5 flex justify-end" }, [acceptButton]),
        ]),
      ],
    );

    document.body.append(overlay);
    acceptButton.focus();
  });
}

export function confirmDialog({ title, message, details = [], confirmLabel = "Eliminar", cancelLabel = "Cancelar" }) {
  return new Promise((resolve) => {
    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    const confirmButton = el(
      "button",
      {
        type: "button",
        class: "rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700",
        onclick: () => close(true),
      },
      confirmLabel,
    );

    const overlay = el(
      "div",
      {
        class: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4",
        onclick: (event) => {
          if (event.target === overlay) close(false);
        },
      },
      [
        el("div", { class: "dialog-enter w-full max-w-sm rounded-lg bg-white p-5 shadow-xl", role: "dialog", "aria-modal": "true" }, [
          el("h2", { class: "text-base font-semibold text-slate-900" }, title),
          el("p", { class: "mt-2 text-sm text-slate-600" }, message),
          details.length > 0
            ? el(
                "ul",
                { class: "mt-3 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-slate-600" },
                details.map((detail) => el("li", {}, detail)),
              )
            : null,
          el("div", { class: "mt-5 flex justify-end gap-2" }, [
            el(
              "button",
              {
                type: "button",
                class: "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50",
                onclick: () => close(false),
              },
              cancelLabel,
            ),
            confirmButton,
          ]),
        ]),
      ],
    );

    document.body.append(overlay);
    confirmButton.focus();
  });
}
