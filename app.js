/*app.js — controllerul principal*/

import * as storage from './storage.js';
import { escapeHTML } from './validator.js';
import * as schedule from './schedule.js';
import * as grades from './grades.js';
import * as calendarMod from './calendar.js';
import * as focus from './focus.js';
import * as widgets from './widgets.js';
import * as gamification from './gamification.js';
import * as aiAssistant from './ai-assistant.js';



/* NAVG INTRE SECTIUNI setActiveSection- ascunde toate sectiunile, afiseaza pe cea ceruta, actualizeaza aria-current pe nav */
function setActiveSection(routeName) {
  const sections = document.querySelectorAll('.section');
  sections.forEach((sec) => {
    if (sec.id === `section-${routeName}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  const navItems = document.querySelectorAll('.nav__item');
  navItems.forEach((item) => {
    if (item.dataset.route === routeName) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  /* scroll sus la schimbare de sectiune (mobile UX) */
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


function initNavigation() {
  const navItems = document.querySelectorAll('.nav__item');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const route = item.dataset.route;
      if (route) setActiveSection(route);
    });
  });
}


/*
   SISTEM DE TOAST-URI
   aici prindem evenimentul si afisam un element care dispare
   automat dupa 3 secunde
*/

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  /* type validat: doar valori din CSS (toast--success, --warning,
     --danger, --info). Nu trm type="<script>",
     clasa devine "toast toast--info" prin fallback. textContent
     + className safe -> anti-XSS */

  const validTypes = ['success', 'warning', 'danger', 'info'];
  const mapped = type === 'error' ? 'danger' : type;
  const safeType = validTypes.includes(mapped) ? mapped : 'info';
  toast.className = `toast toast--${safeType}`;
  toast.setAttribute('role', 'status');
  toast.textContent = String(msg).slice(0, 200);
  container.appendChild(toast);

  /* eliminare dupa 3.3 secunde
     folosim un fade out CSS
     printr-un transition pe opacity setat inline (asa nu
     adaugam un keyframe nou) */
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


function initToasts() {
  document.addEventListener('toast', (e) => {
    const detail = e.detail || {};
    showToast(detail.msg || '', detail.type || 'info');
  });
}


/*THEME*/
const THEMES = [
  { storageKey: 'theme-dark',         className: 'theme-ink',          toggleId: 'toggle-theme'        },
  { storageKey: 'theme-green',        className: 'theme-green',        toggleId: 'toggle-green'        },
  { storageKey: 'theme-sunsetorange', className: 'theme-sunsetorange', toggleId: 'toggle-sunsetorange' },
  { storageKey: 'theme-sakura',       className: 'theme-sakura',       toggleId: 'toggle-sakura'       },
  { storageKey: 'theme-ocean',        className: 'theme-ocean',        toggleId: 'toggle-ocean'        },
];

/* cand bifezi o tema, debifam toate celelalte */
function clearOtherThemes(activeStorageKey) {
  THEMES.forEach((t) => {
    if (t.storageKey === activeStorageKey) return;
    storage.set(t.storageKey, false);
    document.documentElement.classList.remove(t.className);
    const toggle = document.getElementById(t.toggleId);
    if (toggle) toggle.checked = false;
  });
}

function normalizeThemesAtBoot() {
  const active = THEMES.filter((t) => !!storage.get(t.storageKey, false));
  if (active.length > 1) {
    const keep = active[0].storageKey;
    THEMES.forEach((t) => {
      if (t.storageKey !== keep) storage.set(t.storageKey, false);
    });
  }
}


function applyTheme() {
  const isDark = !!storage.get('theme-dark', false);
  if (isDark) {
    document.documentElement.classList.add('theme-ink');
  } else {
    document.documentElement.classList.remove('theme-ink');
  }
  const toggle = document.getElementById('toggle-theme');
  if (toggle) toggle.checked = isDark;
}

function applyGreen() {
  const isGreen = !!storage.get('theme-green', false);
  if (isGreen) {
    document.documentElement.classList.add('theme-green');
  } else {
    document.documentElement.classList.remove('theme-green');
  }
  const toggle = document.getElementById('toggle-green');
  if (toggle) toggle.checked = isGreen;
}

function applyOrange() {
  const isorange = !!storage.get('theme-sunsetorange', false);
  if (isorange) {
    document.documentElement.classList.add('theme-sunsetorange');
  } else {
    document.documentElement.classList.remove('theme-sunsetorange');
  }
  const toggle = document.getElementById('toggle-sunsetorange');
  if (toggle) toggle.checked = isorange;
}

function applyContrast() {
  const high = !!storage.get('high-contrast', false);
  if (high) {
    document.documentElement.classList.add('high-contrast');
  } else {
    document.documentElement.classList.remove('high-contrast');
  }
  const toggle = document.getElementById('toggle-contrast');
  if (toggle) toggle.checked = high;
}

function applySakura() {
  const sakura = !!storage.get('theme-sakura', false);
  if (sakura) {
    document.documentElement.classList.add('theme-sakura');
  } else {
    document.documentElement.classList.remove('theme-sakura');
  }
  const toggle = document.getElementById('toggle-sakura');
  if (toggle) toggle.checked = sakura;
}

function applyOcean() {
  const ocean = !!storage.get('theme-ocean', false);
  if (ocean) {
    document.documentElement.classList.add('theme-ocean');
  } else {
    document.documentElement.classList.remove('theme-ocean');
  }
  const toggle = document.getElementById('toggle-ocean');
  if (toggle) toggle.checked = ocean;
}


function initSettings() {
  /* normalizam din start daca ar fi mai multe teme bifate */
  normalizeThemesAtBoot();

  /* aplicam toate o singura data (doar una va fi efectiv activa) */
  applyTheme();
  applyGreen();
  applyOrange();
  applySakura();
  applyOcean();
  applyContrast();

  const contrastToggle = document.getElementById('toggle-contrast');
  if (contrastToggle) {
    contrastToggle.addEventListener('change', () => {
      storage.set('high-contrast', contrastToggle.checked);
      applyContrast();
    });
  }

  /* dark */
  const themeToggle = document.getElementById('toggle-theme');
  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      if (themeToggle.checked) clearOtherThemes('theme-dark');
      storage.set('theme-dark', themeToggle.checked);
      applyTheme();
    });
  }

  /* green */
  const greenToggle = document.getElementById('toggle-green');
  if (greenToggle) {
    greenToggle.addEventListener('change', () => {
      if (greenToggle.checked) clearOtherThemes('theme-green');
      storage.set('theme-green', greenToggle.checked);
      applyGreen();
    });
  }

  /* orange */
  const orangeToggle = document.getElementById('toggle-sunsetorange');
  if (orangeToggle) {
    orangeToggle.addEventListener('change', () => {
      if (orangeToggle.checked) clearOtherThemes('theme-sunsetorange');
      storage.set('theme-sunsetorange', orangeToggle.checked);
      applyOrange();
    });
  }

  /* sakura */
  const sakuraToggle = document.getElementById('toggle-sakura');
  if (sakuraToggle) {
    sakuraToggle.addEventListener('change', () => {
      if (sakuraToggle.checked) clearOtherThemes('theme-sakura');
      storage.set('theme-sakura', sakuraToggle.checked);
      applySakura();
    });
  }

  /* ocean */
  const oceanToggle = document.getElementById('toggle-ocean');
  if (oceanToggle) {
    oceanToggle.addEventListener('change', () => {
      if (oceanToggle.checked) clearOtherThemes('theme-ocean');
      storage.set('theme-ocean', oceanToggle.checked);
      applyOcean();
    });
  }
}


/* NOTIFICARI BROWSER */

function updateNotificationStatus() {
  const status = document.getElementById('notifications-status');
  if (!status) return;

  if (!('Notification' in window)) {
    status.textContent = 'Browserul tau nu suporta notificari.';
    return;
  }

  switch (Notification.permission) {
    case 'granted':
      status.textContent = '✓ Notificarile sunt activate.';
      break;
    case 'denied':
      status.textContent = 'Ai blocat notificarile. Schimba din setarile browserului daca vrei sa le activezi.';
      break;
    default:
      status.textContent = 'Notificarile nu sunt activate inca.';
  }
}

function initNotifications() {
  updateNotificationStatus();

  const btn = document.getElementById('btn-enable-notifications');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      showToast('Browserul nu suporta notificari', 'warning');
      return;
    }
    if (Notification.permission === 'granted') {
      showToast('Notificarile sunt deja activate', 'info');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        showToast('Notificari activate!', 'success');
        /* Trim una de proba ca sa demonstram ca merge */
        new Notification('Kaizen', {
          body: 'Vom anunta cand ai un test sau o tema apropiata.',
          icon: ''
        });
      } else {
        showToast('Permisiune refuzata', 'warning');
      }
    } catch (err) {
      showToast('Eroare la cerere: ' + err.message, 'error');
    }
    updateNotificationStatus();
  });
}


/* EXPORT / IMPORT / RESET (TOATE DATELE) */

function initExportImportReset() {
  /* export complet*/
  const btnExport = document.getElementById('btn-export-all');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      try {
        const data = storage.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)],
          { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `kaizen-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        /* eliberam URL-ul ca sa nu ramana memory leak */
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast('Date exportate cu succes', 'success');
      } catch (err) {
        showToast('Eroare la export: ' + err.message, 'error');
      }
    });
  }

  /* import: butonul declanseaza input file */
  const btnImport = document.getElementById('btn-import-all');
  const fileInput = document.getElementById('all-file-input');
  if (btnImport && fileInput) {
    btnImport.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        showToast('Fisier invalid — trebuie sa fie .json', 'error');
        fileInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {   // 5 MB
        showToast('Fisier prea mare (max 5 MB)', 'error');
        fileInput.value = '';
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        /* confirmare — import-ul suprascrie tot */
        const ok = confirm(
          'Importarea va inlocui toate datele curente cu cele din fisier. Continui?'
        );
        if (!ok) {
          fileInput.value = '';
          return;
        }

        const result = storage.importAll(data);
        if (result.success) {
          showToast(`Import reusit (${result.count} chei)`, 'success');
          /* incarcam din nou pagina pentru a aplica datele importate in toate modulele simultan */
          setTimeout(() => location.reload(), 800);
        } else {
          showToast('Import esuat: ' + result.error, 'error');
        }
      } catch (err) {
        showToast('Fisier corupt sau invalid', 'error');
      }
      fileInput.value = '';   // permite reselectare aceluiasi fisier
    });
  }

  /* reset complet */
  const btnReset = document.getElementById('btn-reset-all');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const ok1 = confirm(
        '⚠️ Esti sigur(ă) ca vrei sa stergi TOATE datele? ' +
        'Aceasta acțiune nu poate fi anulată.'
      );
      if (!ok1) return;

      const ok2 = confirm(
        'Confirmare finală: pierzi orarul, notele, calendarul, ' +
        'XP-ul, streak-ul si achievement-urile.'
      );
      if (!ok2) return;

      storage.clear();
      showToast('Toate datele au fost sterse', 'info');
      setTimeout(() => location.reload(), 800);
    });
  }
}


/* DATA DIN HEADER ("Azi e [data]") */

function renderTodayDate() {
  const el = document.getElementById('today-date');
  if (!el) return;

  const days = ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'];
  const months = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
                  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

  const d = new Date();
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()];

  el.textContent = `${dayName}, ${dayNum} ${monthName}`;
}

/* CLEANUP (memory leak prevention) */

function initCleanup() {
  window.addEventListener('beforeunload', () => {
    if (typeof focus.cleanup === 'function') {
      try { focus.cleanup(); } catch (_) {}
    }
  });
}


/* BOOT */

function boot() {
  initToasts();
  initSettings();
  initNotifications();
  initExportImportReset();
  initNavigation();
  initCleanup();
  renderTodayDate();

  /* modulele de feature — fiecare se ocupa de propria sectiune */
  schedule.init();
  grades.init();
  calendarMod.init();
  focus.init();
  widgets.init();
  aiAssistant.initAIAssistant();

  /* gamification ultimul: asculta evenimente de la toti ceilalti */
  gamification.init();

  /* mesaj de bun venit (subtil, doar prima data per zi). */
  const lastWelcome = storage.get('last-welcome', null);
  const today = new Date().toISOString().slice(0, 10);
  if (lastWelcome !== today) {
    setTimeout(() => {
      showToast('Bun venit inapoi! 🌸 Hai sa invatam ceva azi.', 'info');
    }, 500);
    storage.set('last-welcome', today);
  }
}

/*executare */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
