/*
  STORAGE.JS - Persistenta datelor (localStorage wrapper
 
  SCOP: Strat de abstractizare peste localStorage. De ce?
    1) localStorage poate arunca exceptii (ex: cand e plin / privat)
    2) Doar string-uri se stocheaza - trebuie JSON.stringify/parse
    3) Vrem un namespace (prefix) ca sa nu intram in conflict cu
       alte aplicatii pe acelasi domeniu
    4) Vrem sa fie usor de schimbat persistenta in viitor (IndexedDB)
 
  AVANTAJ: Toata aplicatia foloseste storage.get/set in loc de
  localStorage direct. Daca schimbam tehnologia de storage maine,
  modificam DOAR acest fisier.
*/

// prefix pentru toate cheile - evita coliziuni cu alte aplicatii
const PREFIX = 'kaizen:';
export function set(key, value) {
  try {
    const json = JSON.stringify(value);
    localStorage.setItem(PREFIX + key, json);
    return true;
  } catch (err) {
    // storage plin, ~5-10MB limita
    console.error(`[Storage] Eroare la salvare "${key}":`, err);
    return false;
  }
}

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Storage] Eroare la citire "${key}":`, err);
    return fallback;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
    return true;
  } catch (err) {
    console.error(`[Storage] Eroare la stergere "${key}":`, err);
    return false;
  }
}

/* Sterge TOATE datele aplicatiei (doar cele cu prefixul nostru).
 */
export function clear() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    keys.forEach((k) => localStorage.removeItem(k));
    return true;
  } catch (err) {
    console.error('[Storage] Eroare la curatare:', err);
    return false;
  }
}

export function exportAll() {
  const out = {};
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((fullKey) => {
        const key = fullKey.slice(PREFIX.length);
        try {
          out[key] = JSON.parse(localStorage.getItem(fullKey));
        } catch {
        }
      });
  } catch (err) {
    console.error('[Storage] Eroare la export:', err);
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: out,
  };
}

export function importAll(importedObj) {
  if (!importedObj || typeof importedObj !== 'object') {
    return { success: false, error: 'Format invalid.' };
  }
  if (importedObj.version !== 1) {
    return { success: false, error: 'Versiune incompatibila.' };
  }
  if (!importedObj.data || typeof importedObj.data !== 'object') {
    return { success: false, error: 'Lipsesc datele.' };
  }

  try {
    let count = 0;
    Object.entries(importedObj.data).forEach(([key, value]) => {
      if (typeof key === 'string' && /^[a-zA-Z0-9_:.-]+$/.test(key)) {
        set(key, value);
        count++;
      }
    });
    return { success: true, count };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const subscribers = new Map();

export function subscribe(key, callback) {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(callback);

  return () => {
    const set = subscribers.get(key);
    if (set) set.delete(callback);
  };
}

export function setReactive(key, value) {
  const ok = set(key, value);
  if (ok && subscribers.has(key)) {
    subscribers.get(key).forEach((cb) => {
      try {
        cb(value);
      } catch (err) {
        console.error('[Storage] Eroare in subscriber:', err);
      }
    });
  }
  return ok;
}
