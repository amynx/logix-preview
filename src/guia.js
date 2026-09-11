// Guía interactiva de Logix. Página aparte: navegación por secciones (con
// resaltado según el scroll), tema claro/oscuro y un asistente de decisión
// «¿Qué necesito hacer?» que lleva al estudiante a la actividad y el propósito
// correctos. Solo DOM; comparte estilos y el tema con la app.

import { el, clear } from "./utils/dom.js";
import { initTheme, toggleTheme } from "./utils/theme.js";

// --- Secciones para la navegación lateral ---
const SECTIONS = [
  { id: "inicio", label: "Cómo pensar el análisis" },
  { id: "asistente", label: "¿Qué necesito hacer?" },
  { id: "estudiantes", label: "1 · Estudiantes" },
  { id: "enunciado", label: "2 · El enunciado" },
  { id: "datos", label: "3 · Datos de entrada" },
  { id: "actividades", label: "4 · Actividades" },
  { id: "cadena", label: "5 · La cadena" },
  { id: "glosario", label: "Glosario" },
];

const NAV_LINK_CLASS = "block rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700";
const NAV_ACTIVE_CLASS = "bg-indigo-50 font-medium text-indigo-700";

function buildNav() {
  const list = document.querySelector("#side-nav ul");
  if (!list) return;
  const links = new Map();
  for (const section of SECTIONS) {
    const link = el("a", { href: `#${section.id}`, class: NAV_LINK_CLASS }, section.label);
    list.append(el("li", {}, [link]));
    links.set(section.id, link);
  }

  // Resalta el enlace de la sección visible (scrollspy).
  const setActive = (id) => {
    for (const [key, link] of links) {
      link.classList.toggle("bg-indigo-50", key === id);
      link.classList.toggle("font-medium", key === id);
      link.classList.toggle("text-indigo-700", key === id);
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: "-20% 0px -70% 0px" },
  );
  for (const section of SECTIONS) {
    const node = document.getElementById(section.id);
    if (node) observer.observe(node);
  }

  // Navegación compacta en móvil (sin barra lateral): un selector «Ir a sección».
  const select = document.getElementById("mobile-nav");
  if (select) {
    for (const section of SECTIONS) {
      select.append(el("option", { value: section.id }, section.label));
    }
    select.addEventListener("change", () => {
      if (select.value) window.location.hash = select.value;
    });
  }
}

// --- Asistente «¿Qué necesito hacer?» ---
// Árbol de decisión: cada nodo es una pregunta con opciones; una opción lleva a
// otro nodo (`next`) o a un resultado (`result`).
const WIZARD = {
  root: "need",
  nodes: {
    need: {
      q: "En este paso del análisis, ¿qué quieres hacer?",
      options: [
        { label: "Registrar un dato que el programa recibe", hint: "No lo calculas tú. Ej.: las calificaciones, la nota aprobatoria", result: "datoEntrada" },
        { label: "Comprobar algo (responder una pregunta de sí/no)", hint: "Ej.: ¿el promedio es ≥ 3?", next: "evalNow" },
        { label: "Calcular o transformar datos para obtener uno nuevo", hint: "Ej.: sumar las notas, calcular el promedio", next: "opPurpose" },
      ],
    },
    evalNow: {
      q: "¿Necesitas usar el resultado de esa comprobación ahora mismo?",
      options: [
        { label: "Sí, ahora quiero decidir o usar el resultado", next: "evalPurpose" },
        { label: "No, quiero dejarla lista para combinarla o usarla después", result: "condReusable" },
      ],
    },
    evalPurpose: {
      q: "¿Qué harás con el resultado (verdadero/falso) de la condición?",
      options: [
        { label: "Decidir por dónde continúa el algoritmo (camino sí / no)", result: "condDecision" },
        { label: "Usarlo en otra operación posterior", result: "condOperation" },
        { label: "Es la información final que se mostrará", result: "condFinal" },
      ],
    },
    opPurpose: {
      q: "¿Para qué servirá el dato que produce la operación?",
      options: [
        { label: "Para otra operación más adelante", result: "opNewOp" },
        { label: "Para tomar una decisión más adelante", result: "opDecision" },
        { label: "Es la información final", result: "opFinal" },
      ],
    },
  },
  results: {
    datoEntrada: {
      kind: "input",
      title: "Es un dato de entrada",
      steps: [
        "Ve a la sección «Datos de entrada».",
        "Agrégalo con «+ Agregar dato».",
        "Ponle un nombre descriptivo y elige su tipo (numérico, lógico o texto).",
        "Si quieres, aplica una convención de nombres para que todos sean consistentes.",
      ],
      tip: "Es de entrada si el programa lo RECIBE desde fuera y no lo calcula. Si lo obtienes con una operación, es un dato resultante (aparece solo, no lo declaras aquí).",
    },
    condReusable: {
      kind: "condition",
      title: "Condición reutilizable (sin evaluar todavía)",
      steps: [
        "Crea una tarjeta de Condición.",
        "Escribe la pregunta en lenguaje natural.",
        "Construye la comprobación (la expresión).",
        "Ponle un nombre para reutilizarla (o deja el genérico Cn).",
        "Deja «Evaluarla ahora» sin marcar.",
      ],
      tip: "Ideal cuando descubres un criterio que combinarás después con otras condiciones (C1 Y C2…).",
    },
    condDecision: {
      kind: "condition",
      title: "Condición evaluada como decisión",
      steps: [
        "Crea una tarjeta de Condición; escribe la pregunta y la comprobación.",
        "Marca «Evaluarla ahora».",
        "Nombra el dato lógico que produce (el tipo lógico es automático).",
        "Propósito: «Usar para tomar una decisión».",
        "Define los caminos: qué pasa si se cumple y si no.",
      ],
      tip: "Aquí el algoritmo se bifurca (sí / no).",
    },
    condOperation: {
      kind: "condition",
      title: "Condición evaluada, para otra operación",
      steps: [
        "Crea la Condición y marca «Evaluarla ahora».",
        "Nombra el dato lógico resultante.",
        "Propósito: «Usar en una nueva operación».",
        "Indica en qué actividad posterior se usará.",
      ],
      tip: "El verdadero/falso alimentará un cálculo posterior.",
    },
    condFinal: {
      kind: "condition",
      title: "Condición evaluada, como información final",
      steps: [
        "Crea la Condición y marca «Evaluarla ahora».",
        "Nombra el dato lógico resultante.",
        "Propósito: «Generar la información final».",
      ],
      tip: "El resultado de la comprobación es la respuesta que se mostrará.",
    },
    opNewOp: {
      kind: "operation",
      title: "Operación para una nueva operación",
      steps: [
        "Crea una tarjeta de Operación; escribe la necesidad y la expresión.",
        "Nombra el dato resultante y elige su tipo.",
        "Propósito: «Usar en una nueva operación».",
        "Indica en qué actividad posterior se usará.",
      ],
      tip: "Ej.: totalVentas → después totalVentas / días.",
    },
    opDecision: {
      kind: "operation",
      title: "Operación cuyo dato alimenta una decisión",
      steps: [
        "Crea la Operación; escribe la necesidad y la expresión.",
        "Nombra el dato resultante y elige su tipo.",
        "Propósito: «Usar para tomar una decisión».",
        "Indica en qué actividad (una condición) se evaluará.",
      ],
      tip: "El dato aún no decide: lo hará una condición más adelante. Ej.: promedio → después promedio ≥ 3.",
    },
    opFinal: {
      kind: "operation",
      title: "Operación cuyo dato es la información final",
      steps: [
        "Crea la Operación; escribe la necesidad y la expresión.",
        "Nombra el dato resultante y elige su tipo.",
        "Propósito: «Generar la información final».",
      ],
      tip: "El dato producido es (parte de) la respuesta. Ej.: «El promedio obtenido es 4.2».",
    },
  },
};

const KIND_STYLE = {
  input: { chip: "bg-sky-100 text-sky-700", card: "border-sky-200 bg-sky-50/40", label: "Dato de entrada" },
  condition: { chip: "bg-indigo-100 text-indigo-700", card: "border-indigo-200 bg-indigo-50/50", label: "Condición" },
  operation: { chip: "bg-emerald-100 text-emerald-700", card: "border-emerald-200 bg-emerald-50/40", label: "Operación" },
};

function renderWizard() {
  const container = document.getElementById("wizard");
  if (!container) return;
  let stack = [WIZARD.root]; // pila de nodos visitados (para «Atrás»)

  const show = (content) => {
    clear(container);
    container.append(content);
  };

  const controls = (extra = []) =>
    el("div", { class: "mt-3 flex flex-wrap items-center gap-2" }, [
      stack.length > 1
        ? el("button", { type: "button", class: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50", onclick: goBack }, "← Atrás")
        : null,
      el("button", { type: "button", class: "rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-600", onclick: restart }, "Reiniciar"),
      ...extra,
    ]);

  const renderNode = (nodeId) => {
    const node = WIZARD.nodes[nodeId];
    const options = node.options.map((option) =>
      el(
        "button",
        {
          type: "button",
          class: "flex w-full flex-col items-start gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-indigo-300 hover:bg-indigo-50",
          onclick: () => choose(option),
        },
        [
          el("span", { class: "text-sm font-medium text-slate-700" }, option.label),
          option.hint ? el("span", { class: "text-xs text-slate-400" }, option.hint) : null,
        ],
      ),
    );
    show(
      el("div", { class: "rounded-xl border border-slate-200 bg-white p-4 shadow-sm" }, [
        el("p", { class: "mb-3 font-semibold text-slate-800" }, node.q),
        el("div", { class: "space-y-2" }, options),
        controls(),
      ]),
    );
  };

  const renderResult = (resultId) => {
    const result = WIZARD.results[resultId];
    const style = KIND_STYLE[result.kind];
    show(
      el("div", { class: `rounded-xl border ${style.card} p-4 shadow-sm` }, [
        el("div", { class: "mb-2 flex items-center gap-2" }, [
          el("span", { class: `rounded-full px-2 py-0.5 text-xs font-semibold ${style.chip}` }, style.label),
          el("span", { class: "font-semibold text-slate-800" }, result.title),
        ]),
        el("ol", { class: "ml-1 space-y-1.5" }, result.steps.map((text, index) =>
          el("li", { class: "flex items-start gap-2 text-sm text-slate-700" }, [
            el("span", { class: "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500" }, String(index + 1)),
            el("span", {}, text),
          ]),
        )),
        el("p", { class: "mt-3 rounded-md bg-white/70 px-3 py-2 text-sm text-slate-600" }, [
          el("strong", {}, "Cuándo: "),
          result.tip,
        ]),
        controls(),
      ]),
    );
  };

  function choose(option) {
    if (option.result) {
      stack.push(`result:${option.result}`);
      renderResult(option.result);
    } else {
      stack.push(option.next);
      renderNode(option.next);
    }
  }
  function goBack() {
    stack.pop();
    const current = stack[stack.length - 1];
    if (current.startsWith("result:")) renderResult(current.slice(7));
    else renderNode(current);
  }
  function restart() {
    stack = [WIZARD.root];
    renderNode(WIZARD.root);
  }

  renderNode(WIZARD.root);
}

function main() {
  initTheme();
  document.getElementById("theme-toggle")?.addEventListener("click", () => toggleTheme());
  buildNav();
  renderWizard();
}

main();
