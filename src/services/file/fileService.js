// Servicio de archivos: convierte un análisis en un archivo .analisis portable
// y viceversa. Separa la (de)serialización pura de la interacción con el
// navegador (Blob, descarga, FileReader), de modo que la lógica sea probable
// sin DOM. El contenido es JSON; la extensión visible es propia de la app.

import { validateImportedAnalysis, migrateAnalysis } from "../../validation/analysisValidation.js";

const FILE_EXTENSION = ".analisis";
const INVALID_FORMAT = "El archivo seleccionado no tiene un formato de análisis válido.";

// --- Parte pura: modelo <-> texto ---

export function serializeAnalysis(analysis) {
  return JSON.stringify(analysis, null, 2);
}

export function deserializeAnalysis(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(INVALID_FORMAT);
  }
  validateImportedAnalysis(data);
  return migrateAnalysis(data);
}

export function fileNameFor(analysis) {
  const base =
    (analysis.title || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // pliega acentos: "cálculo" -> "calculo"
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_") || "analisis";
  return `${base}${FILE_EXTENSION}`;
}

// --- Parte con navegador: archivo <-> disco ---

// Descarga el análisis como un archivo .analisis. La fecha/hora de exportación se
// añade automáticamente (no se pide al usuario) y no altera el modelo guardado.
export function exportAnalysis(analysis) {
  const content = serializeAnalysis({ ...analysis, exportedAt: new Date().toISOString() });
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileNameFor(analysis);
  anchor.click();
  URL.revokeObjectURL(url);
}

// Lee un archivo seleccionado y devuelve el análisis validado (o rechaza con
// un mensaje comprensible).
export function importAnalysis(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(deserializeAnalysis(String(reader.result)));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado."));
    reader.readAsText(file);
  });
}
