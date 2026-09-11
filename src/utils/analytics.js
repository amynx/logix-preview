// Envío de eventos a Google Analytics (gtag). Es seguro: no hace nada si gtag no
// está disponible (p. ej. en pruebas o si el script está bloqueado) y nunca rompe
// la aplicación.

export function trackEvent(name, params = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } catch {
    // No interrumpir la aplicación si analytics falla.
  }
}
