// Abstracción de persistencia local sobre IndexedDB.
// Oculta por completo los detalles de IndexedDB (apertura, versiones, object
// stores, transacciones). El resto de la aplicación solo conoce estas cuatro
// operaciones, de modo que la implementación de almacenamiento podría cambiarse
// sin tocar el controlador ni las vistas.

const DB_NAME = "logix";
const STORE_NAME = "analyses";
const DB_VERSION = 1;

export class StorageService {
  #dbPromise = null;

  #openDb() {
    if (this.#dbPromise) return this.#dbPromise;

    this.#dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.#dbPromise;
  }

  // Ejecuta una operación dentro de una transacción y resuelve con su resultado.
  async #run(mode, operation) {
    const db = await this.#openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  saveAnalysis(analysis) {
    return this.#run("readwrite", (store) => store.put(analysis));
  }

  getAnalysis(id) {
    return this.#run("readonly", (store) => store.get(id));
  }

  getAllAnalyses() {
    return this.#run("readonly", (store) => store.getAll());
  }

  deleteAnalysis(id) {
    return this.#run("readwrite", (store) => store.delete(id));
  }
}
