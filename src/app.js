// Punto de entrada: obtiene los contenedores del DOM, construye las vistas, la
// persistencia y el controlador, y arranca la aplicación.

import { AnalysisView } from "./views/analysisView.js";
import { StudentsView } from "./views/studentsView.js";
import { InputsView } from "./views/inputsView.js";
import { CardsView } from "./views/cardsView.js";
import { ChainView } from "./views/chainView.js";
import { CompletenessView } from "./views/completenessView.js";
import { PdfView } from "./views/pdfView.js";
import { StorageService } from "./services/storage/storageService.js";
import { AnalysisController } from "./controllers/analysisController.js";
import { initStageNav } from "./views/stageNav.js";
import { maybeStartGuide, setExampleTutorialLoader } from "./views/guideView.js";
import { initTheme } from "./utils/theme.js";
import { trackEvent } from "./utils/analytics.js";

function main() {
  initTheme();

  const analysisView = new AnalysisView({
    toolbarContainer: document.getElementById("toolbar"),
    infoContainer: document.getElementById("analysis-info"),
    statusContainer: document.getElementById("save-status"),
    historyContainer: document.getElementById("history-controls"),
  });

  const studentsView = new StudentsView({
    container: document.getElementById("group-control"),
  });

  const inputsView = new InputsView({
    container: document.getElementById("inputs-container"),
  });

  const cardsView = new CardsView({
    container: document.getElementById("table-container"),
  });

  const chainView = new ChainView({
    container: document.getElementById("chain-container"),
  });

  const completenessView = new CompletenessView({
    container: document.getElementById("completeness-container"),
  });

  const pdfView = new PdfView({
    container: document.getElementById("print-area"),
  });

  const controller = new AnalysisController({
    analysisView,
    studentsView,
    inputsView,
    cardsView,
    chainView,
    completenessView,
    pdfView,
    storage: new StorageService(),
  });

  setExampleTutorialLoader(() => controller.loadStudentGradeExample());

  controller.start();
  initStageNav({ onChange: (stage) => trackEvent("go_to_stage", { stage }) });
  maybeStartGuide();
}

main();
