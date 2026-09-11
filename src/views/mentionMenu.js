// Menú de menciones de datos: al escribir "/" en un campo de texto, ofrece los
// datos disponibles (entradas y resultados) para insertarlos como referencia
// "[nombre]". Es reutilizable: `attachMentions(field, getEntries)` lo activa en
// cualquier input/textarea. Un único menú flotante está abierto a la vez.
//
// La referencia se inserta como TEXTO ("[nombre]") para no alterar el modelo:
// estos campos son de texto libre (necesidad, condición, comentario…). El menú
// solo ayuda a insertar; el estudiante decide qué datos menciona.

import { el, clear } from "../utils/dom.js";
import { icon } from "./icons.js";
import { typeBadge } from "./badges.js";

let menuEl = null;
// Estado del menú abierto: campo activo, proveedor de datos, coincidencias,
// opción resaltada y posición del "/" que inició la mención.
let state = null;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = el("div", {
    class: "fixed z-50 max-h-56 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg",
  });
  menuEl.hidden = true;
  // Un clic en el menú no debe robar el foco del campo antes de insertar.
  menuEl.addEventListener("mousedown", (event) => event.preventDefault());
  document.body.appendChild(menuEl);
  return menuEl;
}

// Detecta una mención activa: un "/" iniciado al principio o tras un separador,
// seguido de la consulta hasta el cursor (sin espacios). Devuelve null si no hay.
function mentionAt(field) {
  const caret = field.selectionStart ?? field.value.length;
  const before = field.value.slice(0, caret);
  const slash = before.lastIndexOf("/");
  if (slash === -1) return null;
  const prev = slash > 0 ? before[slash - 1] : " ";
  if (!/[\s(¿[]/.test(prev)) return null; // el "/" debe iniciar la mención
  const query = before.slice(slash + 1);
  if (/\s/.test(query)) return null; // un espacio cancela la mención
  return { start: slash, query };
}

function close() {
  if (menuEl) menuEl.hidden = true;
  state = null;
}

function open(field, getEntries, mention, onSelect) {
  const needle = mention.query.toLowerCase();
  const entries = getEntries().filter((entry) => entry.name.toLowerCase().includes(needle));
  if (entries.length === 0) return close();
  state = { field, entries, index: 0, triggerStart: mention.start, onSelect };
  renderMenu();
  position(field);
  ensureMenu().hidden = false;
}

// ¿Hay un menú de menciones abierto para este campo? Lo consultan los campos con su
// propio manejo de teclado (el constructor de expresiones) para cederle las teclas.
export function isMentionMenuOpen(field) {
  return Boolean(state && state.field === field && menuEl && !menuEl.hidden);
}

function renderMenu() {
  const menu = ensureMenu();
  clear(menu);
  state.entries.forEach((entry, index) => {
    const active = index === state.index;
    menu.appendChild(
      el(
        "button",
        {
          type: "button",
          class: `flex w-full items-center gap-2 px-2 py-1 text-left ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"}`,
          onmousedown: (event) => event.preventDefault(),
          onclick: () => insert(entry),
        },
        [
          icon(entry.produced ? "reuse" : "data", `h-3.5 w-3.5 shrink-0 ${entry.produced ? "text-emerald-500" : "text-blue-500"}`),
          el("span", { class: "min-w-0 flex-1 truncate" }, entry.name),
          entry.type ? typeBadge(entry.type) : null,
        ],
      ),
    );
  });
}

function position(field) {
  const menu = ensureMenu();
  const rect = field.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
}

// Inserta la referencia elegida. Por defecto, como texto "[nombre]" en el campo;
// si el campo aportó `onSelect` (p. ej. el constructor de expresiones), quita la
// "/consulta" y delega la inserción (un token de referencia) en el propio campo.
function insert(entry) {
  const { field, triggerStart, onSelect } = state;
  const caret = field.selectionStart ?? field.value.length;
  const before = field.value.slice(0, triggerStart);
  const after = field.value.slice(caret);
  if (onSelect) {
    field.value = before + after;
    close();
    onSelect(entry);
    return;
  }
  const inserted = `[${entry.name}] `;
  field.value = before + inserted + after;
  const nextCaret = before.length + inserted.length;
  close();
  field.focus();
  field.setSelectionRange(nextCaret, nextCaret);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleInput(field, getEntries, onSelect) {
  const mention = mentionAt(field);
  if (!mention) return close();
  open(field, getEntries, mention, onSelect);
}

function handleKeydown(field, event) {
  if (!state || state.field !== field || menuEl.hidden) return;
  const { entries } = state;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.index = (state.index + 1) % entries.length;
    renderMenu();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.index = (state.index - 1 + entries.length) % entries.length;
    renderMenu();
  } else if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    insert(entries[state.index]);
  } else if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

// Activa el menú de menciones en un campo. `getEntries()` devuelve los datos
// disponibles: [{ id, name, type, produced }] (produced = resultado de otra fila).
// `onSelect(entry)` (opcional) reemplaza la inserción de texto por defecto: el
// campo decide qué hacer con el dato elegido (p. ej. agregar un token de referencia).
export function attachMentions(field, getEntries, { onSelect } = {}) {
  if (!field || typeof getEntries !== "function") return;
  field.addEventListener("input", () => handleInput(field, getEntries, onSelect));
  field.addEventListener("keydown", (event) => handleKeydown(field, event));
  field.addEventListener("blur", () => {
    if (state && state.field === field) close();
  });
}
