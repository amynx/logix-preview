// Guías interactivas: recorridos paso a paso que resaltan una sección (o una fila)
// y la explican. Hay dos: el recorrido de las secciones y un ejemplo guiado que
// muestra cómo se rellena cada parte (fila por fila en la tabla). Son tarjetas
// flotantes que no bloquean la interfaz. Solo se ocupan del DOM.

import { el, clear } from "../utils/dom.js";
import { trackEvent } from "../utils/analytics.js";
import { revealSection } from "./stageNav.js";

const GUIDE_SEEN_KEY = "logix-guide-seen";

// Resuelve el objetivo de un paso: un id de sección o una función que devuelve el
// elemento (p. ej. una fila concreta de la tabla).
const rowTarget = (index) => () => document.querySelectorAll("#table-container [data-row-id]")[index];

const SECTION_STEPS = [
  {
    title: "Bienvenido a Logix",
    target: null,
    body: "Logix te ayuda a analizar un problema antes de diseñar su algoritmo: identificas los datos, descompones el proceso en pasos y ves cómo se encadena todo. Esta guía recorre cada sección.",
  },
  { title: "1 · Estudiantes", target: "students-container", body: "Registra el grupo (común a todos) y los estudiantes que participan. Sirve para identificar quién realiza el análisis; se incluye al exportar el PDF." },
  { title: "2 · Análisis", target: "analysis-info", body: "Escribe el título y describe el problema del mundo real que vas a resolver. Enmarca el análisis: qué necesidad debe atender el programa." },
  { title: "3 · Datos de entrada", target: "inputs-container", body: "Identifica los datos que el programa recibe (nombre y tipo). Se declaran una vez aquí y luego se reutilizan en las actividades, evitando reescribirlos y cometer errores." },
  {
    title: "4 · Actividades",
    target: "table-container",
    body: "Es el corazón del análisis. Cada TARJETA es un paso, de uno de dos tipos: una OPERACIÓN (calcula un dato nuevo) o una CONDICIÓN (comprueba algo, una pregunta de Sí/No). Con «+ Agregar operación» o «+ Agregar condición» creas cada tipo. Para verlo con detalle, prueba el «Ejemplo guiado» desde Ayuda.",
  },
  { title: "5 · Cadena del análisis", target: "chain-container", body: "Visualiza el análisis completo como un flujo: qué entra, cómo se procesa y qué sale. Te permite revisar de un vistazo que todo esté encadenado." },
  { title: "¡Listo para empezar!", target: null, body: "Pulsa «Ejemplo» para ver un caso completo, usa «Ayuda» o los «?» de cada sección cuando tengas dudas, y recuerda que puedes deshacer con Ctrl+Z. ¡A analizar!" },
];

const EXAMPLE_STEPS = [
  { title: "Ejemplo guiado", target: null, body: "Vamos a recorrer un análisis ya construido: decidir si un estudiante aprueba una asignatura a partir de sus notas. Fíjate en cómo se rellena cada sección." },
  { title: "1 · Estudiantes", target: "students-container", body: "Aquí van el grupo y los estudiantes. En el ejemplo: grupo N1 y una estudiante." },
  { title: "2 · Análisis", target: "analysis-info", body: "El título plantea la pregunta y la descripción resume el problema. Si activas el «Enunciado», puedes pegar el texto completo e identificar datos seleccionando un fragmento (p. ej. «4 en el primer parcial») y agregándolo como dato de entrada." },
  { title: "3 · Datos de entrada", target: "inputs-container", body: "Los datos que el programa recibe, con su nombre y tipo: nota1, nota2, nota3 y notaAprobatoria. Con el selector de «Convención» aplicas un estilo de nombres (p. ej. camelCase) a todos a la vez." },
  { title: "4 · Actividades", target: "table-container", body: "Cada tarjeta es un paso. Vamos a recorrerlas una por una, observando de qué tipo es cada una." },
  { title: "Actividad 1: sumar las notas", target: rowTarget(0), block: "center", body: "Es una OPERACIÓN. Referencia nota1, nota2 y nota3, construye nota1 + nota2 + nota3 y produce el dato «sumaNotas». Su propósito: usarlo en una nueva operación." },
  { title: "Actividad 2: calcular el promedio", target: rowTarget(1), block: "center", body: "Otra OPERACIÓN. Reutiliza sumaNotas (producido en el paso anterior) y lo divide entre 3, obteniendo «promedio»." },
  { title: "Actividad 3: la condición que decide", target: rowTarget(2), block: "center", body: "Es una CONDICIÓN evaluada como decisión (tarjeta índigo). La pregunta es «¿el promedio es ≥ la nota aprobatoria?», la comprobación es promedio ≥ notaAprobatoria, y al evaluarla produce el dato lógico «aprobado». En «Si se cumple / Si no se cumple» se definen los caminos: Aprueba / Reprueba." },
  { title: "5 · Cadena del análisis", target: "chain-container", body: "La cadena resume el flujo completo: entran las notas, se procesan (suma → promedio → decisión) y sale el resultado." },
  { title: "Ahora te toca a ti", target: null, body: "Edita este ejemplo o crea uno nuevo con «Nuevo análisis». Puedes reabrir esta guía desde «Ayuda» cuando quieras." },
];

// Cargador del ejemplo del tutorial guiado (lo registra la app con el controlador).
let exampleLoader = null;
export function setExampleTutorialLoader(loader) {
  exampleLoader = loader;
}

// Muestra el recorrido de secciones en la primera visita.
export function maybeStartGuide() {
  let seen = false;
  try {
    seen = localStorage.getItem(GUIDE_SEEN_KEY) === "1";
  } catch {
    seen = false;
  }
  if (!seen) startGuide();
}

export function startGuide() {
  trackEvent("start_section_guide");
  runTour(SECTION_STEPS, { markSeenOnClose: true });
}

export function startExampleTutorial() {
  trackEvent("start_tutorial");
  if (exampleLoader) exampleLoader(); // carga el ejemplo antes de recorrerlo
  runTour(EXAMPLE_STEPS, {});
}

// Motor de recorrido: tarjeta flotante con pasos, resaltando el objetivo de cada uno.
function runTour(steps, { markSeenOnClose = false }) {
  if (document.getElementById("guide-card")) return;
  let index = 0;

  const card = el("div", {
    id: "guide-card",
    class: "fixed bottom-6 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl",
    role: "dialog",
    "aria-label": "Guía",
  });

  const clearHighlight = () => document.querySelectorAll(".guide-highlight").forEach((node) => node.classList.remove("guide-highlight"));

  const close = () => {
    clearHighlight();
    card.remove();
    document.removeEventListener("keydown", onKey);
    if (markSeenOnClose) {
      try {
        localStorage.setItem(GUIDE_SEEN_KEY, "1");
      } catch {
        // localStorage puede no estar disponible; no pasa nada.
      }
    }
  };

  const onKey = (event) => {
    if (event.key === "Escape") close();
  };

  // Elemento a resaltar: la tarjeta interior para que el anillo la ciña (evita el
  // relleno del contenedor); si la sección tiene varias partes, el contenedor.
  const resolveHighlight = (target) => {
    if (typeof target === "function") return target();
    if (typeof target === "string") {
      const container = document.getElementById(target);
      if (!container) return null;
      return container.childElementCount === 1 ? container.firstElementChild : container;
    }
    return null;
  };

  // Elemento al que hacer scroll: el contenedor de la sección, que tiene el
  // `scroll-margin-top` para no quedar bajo la cabecera fija (una fila se centra).
  const resolveScroll = (target) => {
    if (typeof target === "function") return target();
    if (typeof target === "string") return document.getElementById(target);
    return null;
  };

  const render = () => {
    const step = steps[index];
    // Trae a la vista la etapa que contiene el objetivo antes de resaltarlo, para
    // que el recorrido funcione aunque cada etapa se muestre por separado.
    if (typeof step.target === "string") revealSection(step.target);
    else if (typeof step.target === "function") revealSection("table-container");
    clearHighlight();
    const highlight = resolveHighlight(step.target);
    if (highlight) highlight.classList.add("guide-highlight");
    const scrollTo = resolveScroll(step.target);
    if (scrollTo) scrollTo.scrollIntoView({ behavior: "smooth", block: step.block ?? "start" });

    const isLast = index === steps.length - 1;
    clear(card);
    card.append(
      el("div", { class: "mb-2 flex items-start justify-between gap-3" }, [
        el("h2", { class: "text-base font-semibold text-slate-900" }, step.title),
        el("button", { type: "button", class: "rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700", title: "Cerrar guía", "aria-label": "Cerrar guía", onclick: close }, "✕"),
      ]),
      el("p", { class: "text-sm leading-relaxed text-slate-600" }, step.body),
      el("div", { class: "mt-4 flex items-center justify-between gap-2" }, [
        el("button", { type: "button", class: "text-xs font-medium text-slate-400 hover:text-slate-600", onclick: close }, "Omitir"),
        el("div", { class: "flex items-center gap-2" }, [
          el("div", { class: "mr-1 flex gap-1" }, steps.map((_, i) => el("span", { class: `h-1.5 w-1.5 rounded-full ${i === index ? "bg-indigo-600" : "bg-slate-300"}` }))),
          el("button", {
            type: "button",
            class: "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40",
            disabled: index === 0 || null,
            onclick: () => { index -= 1; render(); },
          }, "Anterior"),
          el("button", {
            type: "button",
            class: "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700",
            onclick: () => { if (isLast) close(); else { index += 1; render(); } },
          }, isLast ? "Terminar" : "Siguiente"),
        ]),
      ]),
    );
  };

  document.body.append(card);
  document.addEventListener("keydown", onKey);
  render();
}
