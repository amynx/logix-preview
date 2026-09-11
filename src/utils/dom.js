// Ayudas mínimas para construir DOM desde las vistas.
// Responsabilidad única: crear y limpiar nodos, para que el código de las vistas
// describa la interfaz sin repetir document.createElement en cada línea.

// Crea un elemento. Reglas de props:
//   - "class": className.
//   - "dataset": objeto asignado a node.dataset.
//   - "onEvento": addEventListener (p. ej. oninput, onclick).
//   - propiedad existente en el nodo (value, checked, disabled...): se asigna directa.
//   - resto: setAttribute (for, colspan, aria-*, role...).
// children admite nodos, cadenas, números o null (se ignora).
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }

  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }

  return node;
}

// Vacía un contenedor antes de volver a renderizarlo.
export function clear(node) {
  node.replaceChildren();
}
