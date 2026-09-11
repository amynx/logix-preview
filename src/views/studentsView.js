// Control de "Grupo e integrantes" en la barra superior (Zen): en reposo muestra
// unos avatares con las iniciales y el nombre del grupo; al pulsarlo abre un panel
// para editar el nombre y la lista de integrantes. El grupo es metadato del
// análisis (aparece en el PDF), por eso vive en la barra y no en el lienzo.
// Solo se ocupa del DOM; el estado y la persistencia los coordina el controlador.

import { el, clear } from "../utils/dom.js";
import { icon } from "./icons.js";

// Base del campo SIN ancho (para poder fijarlo por sitio: full, flex-1 o fijo).
const FIELD_BASE =
  "rounded-[var(--lx-r-control)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-2.5 py-1.5 text-[13px] text-[var(--lx-ink)] " +
  "outline-none placeholder:text-[var(--lx-ink-ghost)] focus:border-[oklch(0.72_0.09_300)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)]";
const FIELD_CLASS = `w-full ${FIELD_BASE}`;

// El panel conserva su estado abierto entre re-render (agregar/quitar integrantes
// re-dibuja el control): así no se cierra mientras se edita.
let panelOpen = false;
let draftOpen = false; // campo de borrador para agregar un integrante abierto
let currentRoot = null;
let currentPanel = null;
let globalBound = false;

function closePanel() {
  panelOpen = false;
  draftOpen = false;
  if (currentPanel) currentPanel.hidden = true;
}

// Cierra al pulsar fuera o con Escape. Se registra una sola vez y opera sobre el
// control vigente (actualizado en cada render).
function bindGlobalClose() {
  if (globalBound || typeof document === "undefined") return;
  globalBound = true;
  document.addEventListener("click", (event) => {
    if (panelOpen && currentRoot && !currentRoot.contains(event.target)) closePanel();
  });
  document.addEventListener("keydown", (event) => {
    if (panelOpen && event.key === "Escape") closePanel();
  });
}

// Iniciales para el avatar: primeras letras de las dos primeras palabras del nombre;
// si no hay nombre, las dos primeras del número de identificación; si nada, «?».
function initialsOf(student) {
  const name = (student.fullName ?? "").trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  const id = (student.idNumber ?? "").trim();
  return id ? id.slice(0, 2).toUpperCase() : "?";
}

function avatar(student, index) {
  return el(
    "span",
    {
      class: `inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-[var(--lx-surface)] bg-[var(--lx-entrada-bg)] text-[9.5px] font-semibold text-[var(--lx-entrada-fg)] ${index > 0 ? "-ml-1.5" : ""}`,
      title: (student.fullName ?? "").trim() || (student.idNumber ?? "").trim() || "Integrante",
      dataset: { avatarFor: student.id },
    },
    initialsOf(student),
  );
}

// Refresca en vivo las iniciales de un integrante en todos sus avatares (fila del
// panel y disparador de la barra), sin re-render.
function syncAvatars(studentId, fullName) {
  if (typeof document === "undefined") return;
  const initials = initialsOf({ fullName });
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(studentId) : studentId;
  document.querySelectorAll(`[data-avatar-for="${esc}"]`).forEach((node) => {
    node.textContent = initials;
  });
}

// Pila de avatares: hasta tres; si hay más, un avatar «+N» al final.
function avatarStack(students) {
  const shown = students.slice(0, 3);
  const extra = students.length - shown.length;
  const nodes = shown.map((student, index) => avatar(student, index));
  if (extra > 0) {
    nodes.push(
      el("span", { class: "-ml-1.5 inline-flex h-[22px] items-center justify-center rounded-full border-[1.5px] border-[var(--lx-surface)] bg-[var(--lx-surface-sunken)] px-1 text-[9.5px] font-semibold text-[var(--lx-ink-muted)]" }, `+${extra}`),
    );
  }
  return el("span", { class: "flex shrink-0 items-center" }, nodes);
}

export class StudentsView {
  constructor({ container }) {
    this.container = container;
  }

  render(group, students, handlers) {
    if (!this.container) return;
    clear(this.container);
    bindGlobalClose();

    const hasMembers = students.length > 0;
    const name = (group ?? "").trim();
    const trigger = el(
      "button",
      {
        type: "button",
        "aria-label": "Grupo e integrantes",
        class: "flex h-[34px] items-center gap-2 rounded-[var(--lx-r-control)] px-2 text-[13.5px] font-medium text-[var(--lx-ink-body)] hover:bg-[var(--lx-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lx-violet)]",
        onclick: (event) => {
          event.stopPropagation();
          panelOpen = !panelOpen;
          panel.hidden = !panelOpen;
        },
      },
      hasMembers
        ? [avatarStack(students), el("span", { class: "max-w-[170px] truncate" }, name || "Sin nombre")]
        : [icon("students", "h-4 w-4 text-[var(--lx-violet)]"), "Agregar grupo"],
    );

    const panel = this.#panel(group, students, handlers);
    panel.hidden = !panelOpen;

    const root = el("div", { class: "relative" }, [trigger, panel]);
    this.container.append(root);
    currentRoot = root;
    currentPanel = panel;
    // El campo de borrador recibe el foco al abrirse (o al reabrirse tras un Enter).
    if (draftOpen && this._draftInput) this._draftInput.focus?.();
  }

  // Zona de agregar: un botón punteado que, al pulsarse, se convierte en un campo de
  // borrador enfocado. Enter agrega con ese nombre y deja el campo listo para el
  // siguiente; Escape cierra solo el campo (no el panel).
  #addArea(handlers) {
    this._draftInput = null;
    if (!draftOpen) {
      return el(
        "button",
        {
          type: "button",
          class: "flex w-full items-center justify-center gap-1.5 rounded-[var(--lx-r-control)] border border-dashed border-[var(--lx-border-dashed)] px-3 py-2 text-[12.5px] font-medium text-[var(--lx-ink-muted)] hover:border-[var(--lx-violet)] hover:text-[var(--lx-violet)]",
          onclick: () => {
            draftOpen = true;
            this.#swapAddArea(handlers);
          },
        },
        "+ Agregar integrante",
      );
    }
    const input = el("input", {
      type: "text",
      placeholder: "Nombre del integrante",
      class: FIELD_CLASS,
      onkeydown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const value = input.value.trim();
          if (value) handlers.onAddStudent(value); // re-render: el borrador se reabre enfocado
        } else if (event.key === "Escape") {
          // Cierra solo el campo, no el panel (se detiene la propagación al documento).
          event.preventDefault();
          event.stopPropagation();
          draftOpen = false;
          this.#swapAddArea(handlers);
        }
      },
    });
    this._draftInput = input;
    return input;
  }

  // Reemplaza en el sitio la zona de agregar (botón ↔ borrador) sin re-render, y
  // enfoca el borrador si quedó abierto.
  #swapAddArea(handlers) {
    const area = this.#addArea(handlers);
    if (this._addSlot) {
      this._addSlot.replaceChildren(area);
      if (draftOpen && this._draftInput) this._draftInput.focus?.();
    }
  }

  // Panel anclado bajo el disparador: nombre del grupo, integrantes y una nota.
  #panel(group, students, handlers) {
    const rows =
      students.length > 0
        ? el("div", { class: "space-y-1" }, students.map((student) => memberRow(student, handlers)))
        : el("p", { class: "text-[12.5px] italic text-[var(--lx-ink-muted)]" }, "Aún no hay integrantes.");
    const count = `${students.length} ${students.length === 1 ? "integrante" : "integrantes"}`;
    // Ranura para la zona de agregar, para poder alternar botón ↔ borrador sin re-render.
    const addSlot = el("div", {}, [this.#addArea(handlers)]);
    this._addSlot = addSlot;

    return el(
      "div",
      {
        class: "absolute right-0 top-full z-40 mt-1.5 w-[22rem] space-y-3.5 rounded-[14px] border border-[var(--lx-border)] bg-[var(--lx-surface)] p-3.5 shadow-[var(--lx-shadow-pop)]",
        onclick: (event) => event.stopPropagation(),
      },
      [
        el("div", { class: "space-y-1.5" }, [
          el("label", { for: "analysis-group", class: GROUP_LABEL }, "Grupo"),
          el("input", {
            id: "analysis-group",
            type: "text",
            value: group ?? "",
            placeholder: "Ej.: Grupo 4 · Programación I",
            class: FIELD_CLASS,
            oninput: (event) => handlers.onGroupChange(event.target.value),
          }),
        ]),
        el("div", { class: "space-y-1.5" }, [
          el("div", { class: "flex items-baseline justify-between" }, [
            el("span", { class: GROUP_LABEL }, "Integrantes"),
            el("span", { class: "text-[11px] text-[var(--lx-ink-muted)]" }, count),
          ]),
          rows,
          addSlot,
        ]),
        el("p", { class: "text-[11.5px] leading-snug text-[var(--lx-ink-ghost)]" }, "El grupo es común a todo el análisis y aparece en el PDF exportado."),
      ],
    );
  }
}

// Etiqueta de sección del panel, en versalitas (coherente con los bloques de la app).
const GROUP_LABEL = "text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--lx-ink-muted)]";

// Fila de un integrante en el panel (Zen): avatar con iniciales + nombre + número
// de identificación + quitar. Ambos (nombre e identificación) van al PDF exportado.
function memberRow(student, handlers) {
  const change = (changes) => handlers.onStudentChange(student.id, changes);
  return el("div", { class: "group flex items-center gap-2" }, [
    avatar(student, 0),
    el("input", {
      type: "text",
      value: student.fullName ?? "",
      placeholder: "Nombre completo",
      class: `${FIELD_BASE} min-w-0 flex-1 border-transparent bg-transparent px-1.5 hover:border-[var(--lx-border)] focus:bg-[var(--lx-surface)]`,
      oninput: (event) => {
        // Los avatares (fila y barra) siguen al nombre en vivo, sin re-render.
        syncAvatars(student.id, event.target.value);
        change({ fullName: event.target.value });
      },
    }),
    el("input", {
      type: "text",
      value: student.idNumber ?? "",
      placeholder: "Identificación",
      title: "Número de identificación",
      "aria-label": "Número de identificación",
      class: `${FIELD_BASE} w-[92px] shrink-0 border-transparent bg-transparent px-1.5 text-[12px] hover:border-[var(--lx-border)] focus:bg-[var(--lx-surface)]`,
      oninput: (event) => change({ idNumber: event.target.value }),
    }),
    el(
      "button",
      {
        type: "button",
        class: "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--lx-r-control)] text-[var(--lx-ink-muted)] opacity-0 transition group-hover:opacity-100 hover:bg-[oklch(0.96_0.02_25)] hover:text-[oklch(0.55_0.15_25)]",
        title: "Quitar integrante",
        "aria-label": "Quitar integrante",
        onclick: () => handlers.onRemoveStudent(student.id),
      },
      "×",
    ),
  ]);
}
