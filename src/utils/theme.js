// Tema claro/oscuro. La preferencia se guarda en localStorage; si no hay ninguna,
// se sigue la preferencia del sistema. El oscuro se aplica con la clase `dark` en
// <html>, que el CSS usa para remapear los colores neutros.

const STORAGE_KEY = "logix-theme";

export function initTheme() {
  document.documentElement.classList.toggle("dark", prefersDark());
}

export function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // localStorage puede no estar disponible; el cambio aplica igual en esta sesión.
  }
  return dark;
}

export function isDarkTheme() {
  return document.documentElement.classList.contains("dark");
}

function prefersDark() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored === "dark";
  } catch {
    // ignora el error de acceso a localStorage
  }
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
