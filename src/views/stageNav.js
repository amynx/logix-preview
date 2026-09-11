// Navegación por etapas: convierte el análisis en un progreso guiado
// (Problema → Datos → Construcción → Cadena) y muestra UNA etapa a la vez, para
// que la interfaz se sienta como un recorrido y no como un formulario largo.
// El paso superior refleja el estado de cada etapa (✓ hecha / ● en curso /
// ○ pendiente). Solo se ocupa del DOM; el estado de completitud lo aporta el
// controlador desde el modelo.

import { el, clear } from "../utils/dom.js";
import { icon } from "./icons.js";

export const STAGES = [
  {
    id: "problema",
    label: "Problema",
    hint: "Entiende el problema y quién lo resuelve.",
    title: "El problema",
    intro: "Escribe de qué trata. Si tienes el enunciado, úsalo para identificar los datos.",
  },
  {
    id: "datos",
    label: "Datos",
    hint: "Identifica los datos que recibe el programa.",
    title: "Datos de entrada",
    intro: "Transforma lo que dice el enunciado en datos con nombre y tipo. En las actividades solo se reutilizan estos.",
  },
  {
    id: "construccion",
    label: "Construcción",
    hint: "Descompón el proceso paso a paso.",
    title: "Actividades",
    intro: "Descompón el proceso en pasos. Cada paso toma unos datos, hace algo con ellos y produce uno nuevo.",
  },
  {
    id: "cadena",
    label: "Cadena",
    hint: "Observa cómo fluye tu razonamiento.",
    title: "Cadena del análisis",
    intro: "Cómo fluye tu razonamiento: de los datos a la información final.",
  },
];

let activeStage = STAGES[0].id;
let statusById = {}; // { [stageId]: "done" | "todo" } — la activa se resalta aparte
let onChangeCb = null;

export function initStageNav({ onChange } = {}) {
  onChangeCb = onChange ?? null;
  const rail = document.getElementById("stage-rail");
  if (!rail) return; // en pruebas no existe la cabecera; las funciones quedan inertes
  attachFooters();
  renderRail();
  goToStage(activeStage, { silent: true });
}

// Coloca en cada etapa una barra inferior de avance (Atrás / Continuar) para
// reforzar el recorrido lineal sin impedir saltar libremente desde el paso.
function attachFooters() {
  STAGES.forEach((stage, index) => {
    const wrapper = document.querySelector(`[data-stage="${stage.id}"]`);
    if (!wrapper || wrapper.querySelector("[data-stage-footer]")) return;
    const prev = STAGES[index - 1];
    const next = STAGES[index + 1];
    wrapper.append(
      el("div", { class: "mx-auto mt-8 flex max-w-[82.5rem] items-center justify-between gap-3 border-t border-[var(--lx-border-soft)] px-4 pt-4 sm:px-7", dataset: { stageFooter: "true" } }, [
        prev
          ? el("button", { type: "button", class: "inline-flex h-[34px] items-center gap-1.5 rounded-[var(--lx-r-control)] px-3 text-[13.5px] font-medium text-[var(--lx-ink-muted)] hover:bg-[var(--lx-bg)] hover:text-[var(--lx-ink-body)]", onclick: () => goToStage(prev.id) }, [icon("chevron", "h-4 w-4 rotate-90"), prev.label])
          : el("span", {}),
        next
          ? el("button", { type: "button", class: "inline-flex h-[34px] items-center gap-1.5 rounded-[var(--lx-r-control)] bg-[var(--lx-violet)] px-3.5 text-[13.5px] font-medium text-white hover:bg-[var(--lx-violet-hover)]", onclick: () => goToStage(next.id) }, ["Continuar", icon("chevron", "h-4 w-4 -rotate-90")])
          : el("span", {}),
      ]),
    );
  });
}

export function goToStage(stageId, { silent = false } = {}) {
  if (!STAGES.some((stage) => stage.id === stageId)) return;
  activeStage = stageId;
  document.querySelectorAll("[data-stage]").forEach((node) => {
    node.classList.toggle("hidden", node.dataset.stage !== stageId);
  });
  renderRail();
  renderStageHeader();
  updateStageHint();
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (!silent && onChangeCb) onChangeCb(stageId);
}

// Escribe la pista de la etapa activa en la ranura del dock de ayuda (si existe).
function updateStageHint() {
  const slot = document.getElementById("stage-hint");
  if (!slot) return;
  const stage = STAGES.find((candidate) => candidate.id === activeStage);
  slot.textContent = stage?.hint ?? "";
}

// Encabezado de la etapa: antetítulo «PASO N DE 4 · ETAPA», título y entradilla.
function renderStageHeader() {
  const host = document.getElementById("stage-header");
  if (!host) return;
  clear(host);
  const index = STAGES.findIndex((stage) => stage.id === activeStage);
  const stage = STAGES[index];
  if (!stage) return;
  host.append(
    el("div", { class: "mb-5" }, [
      el("p", { class: "text-[11.5px] font-semibold uppercase tracking-[0.09em] text-[var(--lx-violet)]" }, `Paso ${index + 1} de ${STAGES.length} · ${stage.label}`),
      el("h1", { class: "mt-1 [font-family:var(--lx-font-display)] text-[26px] font-semibold tracking-[-0.02em] text-[var(--lx-ink)]" }, stage.title),
      el("p", { class: "mt-1 max-w-[62ch] text-[14px] text-[var(--lx-ink-muted)]" }, stage.intro),
    ]),
  );
}

// Trae a la vista la etapa que contiene una sección concreta (p. ej. al saltar a
// una actividad desde un aviso, o durante una guía). Devuelve la etapa mostrada.
export function revealSection(sectionId) {
  const section = document.getElementById(sectionId);
  const wrapper = section?.closest("[data-stage]");
  if (!wrapper) return null;
  if (wrapper.dataset.stage !== activeStage) goToStage(wrapper.dataset.stage);
  return wrapper.dataset.stage;
}

// El controlador informa qué etapas están completas; la activa manda sobre su
// estado (se muestra "en curso" aunque aún no esté completa).
export function setStageStatus(map) {
  statusById = map ?? {};
  renderRail();
}

export function getActiveStage() {
  return activeStage;
}

// Riel vertical flotante (Zen): un punto por etapa, con su estado (completa ✓,
// en curso, pendiente) y el nombre en el tooltip. Sustituye al stepper horizontal.
function renderRail() {
  const rail = document.getElementById("stage-rail");
  if (!rail) return;
  clear(rail);
  // Caja global que envuelve el riel; dentro, cada etapa es su propia celda. En móvil
  // el riel es una barra horizontal abajo; en escritorio, vertical a la izquierda.
  rail.append(
    el("div", { class: "flex flex-row items-center gap-2 rounded-[16px] border border-[var(--lx-border)] bg-[var(--lx-surface)] p-2 shadow-[var(--lx-shadow-card)] md:flex-col" }, STAGES.map((stage, index) => railDot(stage, index))),
  );
}

function railDot(stage, index) {
  const isActive = stage.id === activeStage;
  const isDone = statusById[stage.id] === "done";
  // La caja (celda) contiene un círculo con el número/estado. La etapa activa manda
  // sobre "completa": se muestra en curso (violeta) aunque su contenido esté completo.
  const circleTone = isActive
    ? "bg-[var(--lx-violet)] text-white"
    : isDone
      ? "bg-[var(--lx-green)] text-white"
      : "bg-[var(--lx-surface-sunken)] text-[var(--lx-ink-muted)]";
  const boxTone = isActive
    ? "border-[var(--lx-violet)] bg-[var(--lx-entrada-bg)]"
    : "border-[var(--lx-border)] bg-[var(--lx-surface)] hover:bg-[var(--lx-bg)]";
  const circle = el(
    "span",
    { class: `flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${circleTone}` },
    isDone && !isActive ? [icon("check", "h-3.5 w-3.5")] : String(index + 1),
  );
  const dot = el(
    "button",
    {
      type: "button",
      dataset: { stageStep: stage.id },
      "aria-label": stage.label,
      "aria-current": isActive ? "step" : null,
      class: `flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lx-violet)] ${boxTone}`,
      onclick: () => goToStage(stage.id),
    },
    [circle],
  );
  // Tooltip lateral (aparece a la derecha del punto al pasar el cursor o enfocarlo):
  // el nombre de la etapa, con el número; estilizado como un panel de la app.
  const tip = el(
    "span",
    {
      class:
        "pointer-events-none absolute left-full top-1/2 z-30 ml-2.5 hidden -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-[var(--lx-r-control)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-2.5 py-1 text-[13px] font-medium text-[var(--lx-ink-body)] opacity-0 shadow-[var(--lx-shadow-pop)] transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 md:flex",
      "aria-hidden": "true",
    },
    [
      el("span", { class: "text-[11px] font-semibold text-[var(--lx-ink-muted)]" }, String(index + 1)),
      stage.label,
    ],
  );
  return el("div", { class: "group relative flex" }, [dot, tip]);
}
