// Vista de la cabecera del análisis: barra de herramientas e información
// editable (título y descripción). Solo se ocupa del DOM; no conoce el modelo
// ni la persistencia. Recibe callbacks y notifica los cambios del usuario.

import { el, clear } from "../utils/dom.js";
import { icon } from "./icons.js";
import { openHelp } from "./helpView.js";
import { startExampleTutorial } from "./guideView.js";
import { toggleTheme } from "../utils/theme.js";
import { trackEvent } from "../utils/analytics.js";
import { capitalizeFirst } from "../models/textNormalization.js";
import { attachMentions } from "./mentionMenu.js";
import { goToStage, STAGES, getActiveStage } from "./stageNav.js";

const INPUT_CLASS =
  "w-full rounded-[var(--lx-r-field)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-[13px] py-[10px] " +
  "text-[14.5px] text-[var(--lx-ink)] outline-none placeholder:text-[var(--lx-ink-ghost)] " +
  "focus:border-[oklch(0.72_0.09_300)] focus:ring-2 focus:ring-[oklch(0.90_0.05_300)]";

const LABEL_CLASS = "block text-[13px] font-medium text-[var(--lx-ink-body)]";
const HELP_CLASS = "mt-1 text-[12.5px] text-[var(--lx-ink-muted)]";
// Tarjeta base del rediseño (superficie, borde y sombra por token).
const CARD_CLASS = "rounded-[var(--lx-r-card)] border border-[var(--lx-border)] bg-[var(--lx-surface)] p-5 shadow-[var(--lx-shadow-card)]";

// Acorta un fragmento largo para mostrarlo en una etiqueta.
function truncate(text, max = 40) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Divide el enunciado en nodos: los fragmentos ya identificados como datos se
// resaltan como chips pulsables (al pulsarlos se quita el dato); el resto es texto.
function highlightFragments(text, added, onRemove) {
  const sources = added.filter((entry) => entry.source).sort((a, b) => b.source.length - a.source.length);
  const nodes = [];
  let buffer = "";
  let i = 0;
  while (i < text.length) {
    const match = sources.find((entry) => text.startsWith(entry.source, i));
    if (match) {
      if (buffer) {
        nodes.push(buffer);
        buffer = "";
      }
      nodes.push(fragmentChip(match.source, () => onRemove?.(match.id)));
      i += match.source.length;
    } else {
      buffer += text[i];
      i += 1;
    }
  }
  if (buffer) nodes.push(buffer);
  return nodes;
}

function fragmentChip(source, onRemove) {
  return el(
    "span",
    {
      class: "cursor-pointer rounded-[7px] border border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)] px-1.5 py-0.5 text-[var(--lx-entrada-fg)] hover:brightness-95",
      title: "Quitar este dato de entrada",
      onclick: (event) => {
        event.stopPropagation();
        onRemove();
      },
    },
    source,
  );
}

// Estilos base de la barra (tokens del rediseño): botón de 34px, radio 9px.
const BAR_BTN_BASE = "inline-flex h-[34px] items-center gap-1.5 rounded-[var(--lx-r-control)] px-3 text-[13.5px] font-medium";
const BAR_GHOST = `${BAR_BTN_BASE} border border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-body)] hover:bg-[var(--lx-bg)]`;
const BAR_PRIMARY = `${BAR_BTN_BASE} bg-[var(--lx-violet)] text-white hover:bg-[var(--lx-violet-hover)]`;

// Botón en línea de la barra (escritorio): fantasma o primario (violeta sólido).
function barButton(label, onClick, iconName, { primary = false } = {}) {
  return el("button", { type: "button", class: primary ? BAR_PRIMARY : BAR_GHOST, onclick: onClick }, [
    iconName ? icon(iconName, "h-4 w-4") : null,
    label,
  ]);
}

// Opción a todo el ancho para un menú desplegable (Archivo / menú móvil).
function menuItem(label, onClick, iconName) {
  return el(
    "button",
    {
      type: "button",
      class: "inline-flex w-full items-center justify-start gap-1.5 rounded-[var(--lx-r-control)] px-3 py-1.5 text-[13.5px] font-medium text-[var(--lx-ink-body)] hover:bg-[var(--lx-bg)] hover:text-[var(--lx-violet)]",
      onclick: onClick,
    },
    [iconName ? icon(iconName, "h-4 w-4") : null, label],
  );
}

// Menú desplegable: el disparador abre un panel de opciones. Cierra al elegir una,
// pulsar fuera o volver a pulsar el disparador. `align` fija el borde del panel.
function dropdownMenu(trigger, items, { align = "right" } = {}) {
  const panel = el(
    "div",
    {
      class: `absolute ${align === "left" ? "left-0" : "right-0"} top-full z-30 mt-1 hidden w-56 flex-col gap-1 rounded-[var(--lx-r-panel)] border border-[var(--lx-border)] bg-[var(--lx-surface)] p-2 shadow-[var(--lx-shadow-pop)]`,
      onclick: (event) => {
        if (event.target.closest("button")) close();
      },
    },
    items,
  );
  const close = () => panel.classList.replace("flex", "hidden");
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.classList.contains("hidden") ? panel.classList.replace("hidden", "flex") : close();
  });
  const wrapper = el("div", { class: "relative" }, [trigger, panel]);
  document.addEventListener("click", (event) => {
    if (panel.classList.contains("flex") && !wrapper.contains(event.target)) close();
  });
  return wrapper;
}

// Estados del guardado. Se usan etiquetas cortas y un ancho reservado para que el
// cambio de estado no altere el layout del navbar; el icono distingue cada estado.
// Botón compacto (solo icono) para deshacer/rehacer.
function historyButton(iconName, label, onClick) {
  return el(
    "button",
    {
      type: "button",
      class: "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-body)] hover:bg-[var(--lx-bg)] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-[var(--lx-ink-ghost)]",
      title: label,
      "aria-label": label,
      onclick: onClick,
    },
    [icon(iconName, "h-4 w-4")],
  );
}

const SAVE_STATUS = {
  idle: { text: "", pill: "text-transparent", icon: () => null },
  saving: { text: "Guardando…", pill: "bg-[var(--lx-surface-sunken)] text-[var(--lx-ink-muted)]", icon: spinner },
  saved: { text: "Guardado", pill: "border border-[var(--lx-resultante-border)] bg-[var(--lx-resultante-bg)] text-[var(--lx-resultante-fg)]", icon: () => icon("check", "h-3.5 w-3.5") },
  error: { text: "Sin guardar", pill: "border border-[oklch(0.90_0.05_25)] bg-[oklch(0.96_0.02_25)] text-[oklch(0.55_0.15_25)]", icon: dot },
};

// Pequeño anillo giratorio para el estado "Guardando…".
function spinner() {
  return el("span", { class: "h-3 w-3 animate-spin rounded-full border-2 border-[var(--lx-border)] border-t-[var(--lx-ink-muted)]" });
}

// Punto sólido para el estado de error.
function dot() {
  return el("span", { class: "h-2 w-2 rounded-full bg-red-500" });
}

export class AnalysisView {
  constructor({ toolbarContainer, infoContainer, statusContainer, historyContainer }) {
    this.toolbarContainer = toolbarContainer;
    this.infoContainer = infoContainer;
    this.statusContainer = statusContainer;
    this.historyContainer = historyContainer;
    this.statusIcon = null;
    this.statusLabel = null;
  }

  // Indicador de guardado en una ranura estable del header. Reserva un ancho fijo
  // y transiciona solo el color, sin desplazar los demás elementos.
  renderStatus() {
    clear(this.statusContainer);
    this.statusIcon = el("span", { class: "flex h-3.5 w-3.5 items-center justify-center" });
    // La etiqueta se oculta en móvil (solo el icono) para no desbordar la cabecera.
    this.statusLabel = el("span", { class: "hidden md:inline" }, "");
    this.statusContainer.append(
      el("span", { class: "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors md:min-w-[7.75rem] md:px-2.5" }, [
        this.statusIcon,
        this.statusLabel,
      ]),
    );
    this.setSaveStatus("idle");
  }

  renderToolbar({ onNew, onOpenFile, onSaveFile, onExportPdf, onUndo, onRedo }) {
    clear(this.toolbarContainer);

    const fileInput = el("input", {
      type: "file",
      accept: ".analisis,application/json",
      class: "hidden",
      onchange: (event) => {
        const [file] = event.target.files;
        if (file) onOpenFile(file);
        event.target.value = ""; // permite reabrir el mismo archivo
      },
    });

    const toggleThemeTracked = () => trackEvent("toggle_theme", { dark: toggleTheme() });

    // Barra de escritorio: las acciones de archivo se agrupan en "Archivo" y las
    // acciones clave quedan a la vista.
    const archivoTrigger = el(
      "button",
      { type: "button", class: BAR_GHOST },
      [icon("folder", "h-4 w-4"), "Archivo", icon("chevron", "h-3.5 w-3.5")],
    );
    const archivo = dropdownMenu(
      archivoTrigger,
      [
        menuItem("Nuevo análisis", onNew, "new"),
        menuItem("Abrir análisis", () => fileInput.click(), "open"),
        menuItem("Guardar archivo", onSaveFile, "save"),
      ],
      { align: "left" },
    );
    // Barra de escritorio mínima (Zen): solo archivo y exportar. Ejemplo guiado,
    // guía, ayuda y contraste viven en el dock de ayuda flotante (esquina inferior).
    const desktopBar = el("div", { class: "hidden items-center gap-2 md:flex" }, [
      archivo,
      barButton("Exportar PDF", onExportPdf, "pdf", { primary: true }),
    ]);

    // Menú móvil: una hamburguesa con todas las acciones en una lista plana.
    const hamburger = el(
      "button",
      { type: "button", class: BAR_GHOST, "aria-label": "Abrir menú" },
      [icon("menu", "h-4 w-4"), "Menú"],
    );
    const mobileMenu = dropdownMenu(hamburger, [
      menuItem("Nuevo análisis", onNew, "new"),
      menuItem("Abrir análisis", () => fileInput.click(), "open"),
      menuItem("Guardar archivo", onSaveFile, "save"),
      menuItem("Exportar PDF", onExportPdf, "pdf"),
      menuItem("Ejemplo guiado", () => startExampleTutorial(), "example"),
      menuItem("Guía", () => window.open("guia.html", "_blank", "noopener"), "book"),
      menuItem("Ayuda", () => openHelp(), "help"),
      menuItem("Tema", toggleThemeTracked, "contrast"),
    ]);
    mobileMenu.classList.add("md:hidden");

    // Deshacer/rehacer: botones compactos junto al indicador de guardado (izquierda).
    this.undoButton = historyButton("undo", "Deshacer", onUndo);
    this.redoButton = historyButton("redo", "Rehacer", onRedo);
    clear(this.historyContainer);
    this.historyContainer.append(this.undoButton, this.redoButton);

    this.toolbarContainer.append(desktopBar, mobileMenu, fileInput);
    this.renderHelpDock();
  }

  // Dock de ayuda flotante (Zen), esquina inferior derecha: un botón «?» que abre un
  // menú hacia arriba con Ejemplo guiado, Guía, Ayuda y Cambiar contraste, más la
  // pista de la etapa activa. A su izquierda queda una ranura para controles de la
  // etapa (p. ej. el zoom de la Cadena). Inerte si no existe el contenedor (pruebas).
  renderHelpDock() {
    const dock = document.getElementById("help-dock");
    if (!dock) return;
    clear(dock);
    const toggleThemeTracked = () => trackEvent("toggle_theme", { dark: toggleTheme() });
    const menu = el(
      "div",
      {
        id: "help-menu",
        class: "absolute bottom-full right-0 mb-2 hidden w-60 flex-col gap-1 rounded-[var(--lx-r-panel)] border border-[var(--lx-border)] bg-[var(--lx-surface)] p-2 shadow-[var(--lx-shadow-pop)]",
        onclick: (event) => {
          if (event.target.closest("button")) close();
        },
      },
      [
        menuItem("Ejemplo guiado", () => startExampleTutorial(), "example"),
        menuItem("Guía del análisis", () => window.open("guia.html", "_blank", "noopener"), "book"),
        menuItem("Ayuda", () => openHelp(), "help"),
        menuItem("Cambiar contraste", toggleThemeTracked, "contrast"),
        el("div", { class: "mt-1 border-t border-[var(--lx-border-soft)] px-2 pb-0.5 pt-2" }, [
          el("p", { id: "stage-hint", class: "text-[12px] leading-snug text-[var(--lx-ink-muted)]" }, ""),
        ]),
      ],
    );
    const close = () => menu.classList.replace("flex", "hidden");
    const trigger = el(
      "button",
      {
        type: "button",
        "aria-label": "Ayuda",
        title: "Ayuda",
        class: "flex h-10 w-10 items-center justify-center rounded-full border border-[var(--lx-border)] bg-[var(--lx-surface)] text-[var(--lx-ink-body)] shadow-[var(--lx-shadow-card)] hover:bg-[var(--lx-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lx-violet)]",
        onclick: (event) => {
          event.stopPropagation();
          menu.classList.contains("hidden") ? menu.classList.replace("hidden", "flex") : close();
        },
      },
      [icon("help", "h-5 w-5")],
    );
    const widget = el("div", { class: "relative" }, [menu, trigger]);
    document.addEventListener("click", (event) => {
      if (menu.classList.contains("flex") && !widget.contains(event.target)) close();
    });
    dock.append(widget);
    // Pista inicial de la etapa activa (luego stageNav la actualiza al cambiar).
    const stage = STAGES.find((candidate) => candidate.id === getActiveStage());
    if (stage) menu.querySelector("#stage-hint").textContent = stage.hint;
  }

  // Habilita o deshabilita los botones de deshacer/rehacer según el historial.
  setHistoryState(canUndo, canRedo) {
    if (this.undoButton) this.undoButton.disabled = !canUndo;
    if (this.redoButton) this.redoButton.disabled = !canRedo;
  }

  setSaveStatus(state) {
    if (!this.statusLabel) return;
    const status = SAVE_STATUS[state] ?? SAVE_STATUS.idle;
    // Al terminar de guardar se muestra la hora real del último guardado (Zen).
    this.statusLabel.textContent =
      state === "saved" ? `Guardado ${new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}` : status.text;
    clear(this.statusIcon);
    const iconNode = status.icon();
    if (iconNode) this.statusIcon.append(iconNode);
    this.statusIcon.parentElement.className =
      `inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors md:min-w-[7.75rem] md:px-2.5 ${status.pill}`;
  }

  renderInfo(analysis, { onTitleChange, onDescriptionChange, onStatementChange, onAddDataFromSelection, onRemoveFragment, isFragmentAdded, showStatement, onToggleStatement, getDataMentions }) {
    clear(this.infoContainer);

    // Espejo del título del análisis en la barra superior (Zen). Se refresca en cada
    // render, así que sigue a lo que el usuario escribe en el campo de título.
    const topTitle = document.getElementById("analysis-title-top");
    if (topTitle) topTitle.textContent = (analysis.title ?? "").trim() || "Análisis sin título";

    const title = el("input", {
      id: "analysis-title",
      type: "text",
      value: analysis.title,
      placeholder: "Ej.: Determinar si un estudiante aprueba",
      class: INPUT_CLASS,
      oninput: (event) => {
        // El espejo del título en la barra superior sigue a la escritura en vivo.
        if (topTitle) topTitle.textContent = event.target.value.trim() || "Análisis sin título";
        onTitleChange(event.target.value);
      },
    });

    const description = el("textarea", {
      id: "analysis-description",
      rows: 3,
      value: analysis.description,
      placeholder: "Describe el problema del mundo real que se quiere resolver",
      class: `${INPUT_CLASS} resize-y`,
      oninput: (event) => onDescriptionChange(event.target.value),
      // Capitaliza la presentación al desenfocar, sin interrumpir la escritura.
      onblur: (event) => {
        const normalized = capitalizeFirst(event.target.value);
        if (normalized !== event.target.value) {
          event.target.value = normalized;
          onDescriptionChange(normalized);
        }
      },
    });
    if (getDataMentions) attachMentions(description, getDataMentions);

    // Enunciado del problema: el texto sobre el que se identifican los datos. El
    // textarea crece con el contenido (conserva saltos de línea y párrafos) hasta
    // un máximo, para que un enunciado largo no quede apretado.
    const statement = el("textarea", {
      id: "analysis-statement",
      value: analysis.statement,
      placeholder: "Pega aquí el enunciado completo del problema. Luego selecciona un fragmento (p. ej. «500 unidades») para agregarlo como dato de entrada.",
      class: `${INPUT_CLASS} min-h-[7rem] max-h-[36rem] resize-none overflow-y-auto leading-relaxed`,
      oninput: (event) => {
        onStatementChange(event.target.value);
        autoGrow();
      },
      onmouseup: () => updateSelectionBar(selectedFragment()),
      onkeyup: () => updateSelectionBar(selectedFragment()),
      onselect: () => updateSelectionBar(selectedFragment()),
    });
    const autoGrow = () => {
      statement.style.height = "auto";
      statement.style.height = `${statement.scrollHeight}px`;
    };

    const selectionBar = el("div", { class: "mt-2 flex min-h-[2rem] items-center" });
    const selectedFragment = () => statement.value.substring(statement.selectionStart, statement.selectionEnd).trim();

    // Barra de acción de la selección: agregar el fragmento seleccionado como dato.
    // El fragmento llega del textarea (edición) o de la selección del panel (lectura).
    const updateSelectionBar = (fragment = "") => {
      clear(selectionBar);
      // Sin selección no se muestra ayuda persistente: la guía ya está sobre el panel.
      if (!fragment) return;
      if (isFragmentAdded(fragment)) {
        selectionBar.append(el("span", { class: "inline-flex items-center gap-1.5 text-[12.5px] text-[var(--lx-resultante-fg)]" }, [icon("check", "h-3.5 w-3.5"), `«${truncate(fragment)}» ya está en Datos de entrada.`]));
        return;
      }
      selectionBar.append(
        el(
          "button",
          {
            type: "button",
            class: "inline-flex items-center gap-1.5 rounded-[var(--lx-r-control)] border border-[var(--lx-entrada-border)] bg-[var(--lx-entrada-bg)] px-2.5 py-1 text-[13px] font-medium text-[var(--lx-entrada-fg)] hover:brightness-95",
            // Evita que el botón robe el foco y pierda la selección.
            onmousedown: (event) => event.preventDefault(),
            onclick: () => onAddDataFromSelection(fragment),
          },
          [icon("data", "h-4 w-4"), `Agregar «${truncate(fragment)}» como dato de entrada`],
        ),
      );
    };

    // Panel de lectura del enunciado: el texto con los fragmentos ya identificados
    // resaltados (violeta) y pulsables para quitarlos; seleccionar texto nuevo lo
    // ofrece como dato. Es la vista principal; el textarea aparece al «Editar texto».
    const added = analysis.data
      .filter((entry) => (entry.source ?? "").trim())
      .map((entry) => ({ id: entry.id, source: entry.source.trim() }));
    const statementView = el("div", {
      class: "min-h-[7rem] cursor-text whitespace-pre-wrap rounded-[var(--lx-r-panel)] border border-[var(--lx-border)] bg-[oklch(0.985_0.004_285)] px-3.5 py-3 text-[15px] leading-[2.05] text-[var(--lx-ink-body)]",
      onmouseup: () => updateSelectionBar((window.getSelection?.()?.toString() ?? "").trim()),
    });
    const paintPanel = () => {
      clear(statementView);
      const text = statement.value;
      if (text.trim()) statementView.append(...highlightFragments(text, added, onRemoveFragment));
      else statementView.append(el("span", { class: "italic text-[var(--lx-ink-ghost)]" }, "Pega aquí el enunciado y luego «Editar texto» para ajustarlo."));
    };

    // Alterna entre el panel resaltado (lectura) y el textarea (edición).
    const setEditing = (editing) => {
      statement.hidden = !editing;
      statementView.hidden = editing;
      editToggle.textContent = editing ? "Listo" : "Editar texto";
      if (editing) {
        statement.focus();
        autoGrow();
      } else {
        paintPanel();
      }
    };
    const editToggle = el("button", {
      type: "button",
      class: "text-[12.5px] font-medium text-[var(--lx-violet)] hover:underline",
      onclick: () => setEditing(statement.hidden),
    });

    // Casilla-botón "Tengo el enunciado del problema": una fila completa con un
    // cuadro que se rellena de violeta y muestra ✓ cuando está activa.
    const statementToggle = el(
      "button",
      {
        type: "button",
        class: "flex w-full items-center gap-2.5 rounded-[var(--lx-r-field)] border border-[var(--lx-border)] bg-[var(--lx-surface)] px-3 py-2.5 text-left text-[13.5px] font-medium text-[var(--lx-ink-body)] hover:bg-[var(--lx-bg)]",
        "aria-pressed": String(Boolean(showStatement)),
        onclick: () => onToggleStatement(),
      },
      [
        el(
          "span",
          { class: `flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border ${showStatement ? "border-[var(--lx-violet)] bg-[var(--lx-violet)] text-white" : "border-[var(--lx-border)]"}` },
          showStatement ? [icon("check", "h-3 w-3")] : [],
        ),
        "Tengo el enunciado del problema",
      ],
    );

    // Recuento de fragmentos ya convertidos en datos de entrada (llevan `source`),
    // sobre el total de datos declarados: «X de Y fragmentos agregados como datos».
    const addedCount = analysis.data.filter((entry) => (entry.source ?? "").trim()).length;
    // Total sobre los datos de ENTRADA (los que no produce ninguna actividad), no
    // sobre los resultados: «X de Y» = fragmentos del enunciado sobre datos de entrada.
    const producedIds = new Set(analysis.rows.map((row) => row.resultId).filter(Boolean));
    const totalInputs = analysis.data.filter((entry) => !producedIds.has(entry.id)).length;
    const statementFooter = el("div", { class: "mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--lx-border-soft)] pt-3 text-[12.5px]" }, [
      el("span", { class: "text-[var(--lx-ink-muted)]" }, addedCount > 0 ? `${addedCount} de ${totalInputs} ${totalInputs === 1 ? "fragmento agregado" : "fragmentos agregados"} como datos` : "Aún no has agregado fragmentos."),
      el("button", { type: "button", class: "inline-flex items-center gap-1 font-medium text-[var(--lx-violet)] hover:underline", onclick: () => goToStage("datos") }, ["Ver los datos", icon("chevron", "h-3.5 w-3.5 -rotate-90")]),
    ]);

    // Izquierda: "De qué trata" (título y descripción). Derecha: "El enunciado".
    const numeral = (n) => el("span", { class: "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--lx-surface-sunken)] text-[11px] font-semibold text-[var(--lx-ink-muted)]" }, String(n));
    const cardTitle = (n, text) => el("div", { class: "mb-4 flex items-center gap-2" }, [numeral(n), el("h2", { class: "[font-family:var(--lx-font-display)] text-[16px] font-semibold tracking-[-0.01em] text-[var(--lx-ink)]" }, text)]);

    const leftCard = el("div", { class: `flex-1 basis-[380px] ${CARD_CLASS}` }, [
      cardTitle(1, "De qué trata"),
      el("div", { class: "space-y-4" }, [
        el("div", {}, [
          el("label", { for: "analysis-title", class: LABEL_CLASS }, "Título del análisis"),
          el("div", { class: "mt-1.5" }, [title]),
        ]),
        el("div", {}, [
          el("label", { for: "analysis-description", class: LABEL_CLASS }, "Descripción del problema"),
          el("div", { class: "mt-1.5" }, [description]),
          el("p", { class: HELP_CLASS }, "Contexto general: qué necesidad debe resolver el programa."),
        ]),
      ]),
    ]);

    const rightCard = el("div", { class: `flex-[1.3] basis-[440px] ${CARD_CLASS} border-[oklch(0.90_0.03_300)]` }, [
      cardTitle(2, "El enunciado"),
      statementToggle,
      showStatement
        ? el("div", { class: "mt-3 space-y-2" }, [
            el("div", { class: "flex items-center justify-between gap-2" }, [
              el("p", { class: "text-[12.5px] text-[var(--lx-ink-muted)]" }, "Toca un fragmento resaltado para convertirlo en un dato de entrada."),
              editToggle,
            ]),
            statementView,
            statement,
            selectionBar,
            statementFooter,
          ])
        : el("p", { class: HELP_CLASS + " mt-3" }, "Si lo activas, podrás pegar el enunciado y seleccionar fragmentos para convertirlos en datos de entrada. Si no, los declararás a mano en la etapa Datos."),
    ]);

    this.infoContainer.append(el("div", { class: "flex flex-wrap items-start gap-[22px]" }, [leftCard, rightCard]));

    if (showStatement) {
      // Modo inicial: si hay enunciado, se muestra el panel resaltado; si está vacío,
      // el textarea para pegarlo.
      setEditing(!(analysis.statement ?? "").trim());
      updateSelectionBar();
    }
  }
}
