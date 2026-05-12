/**

  FOCUS.JS - Pomodoro Timer + Anti-Distragere
 
  folosim Page Visibility API: cand user-ul comuta pe alt tab,
  documentul devine "hidden". Detectam asta cu evenimentul
 `visibilitychange` pe document.
 
  in timpul unei sesiuni de focus:
    1. numaram de cate ori user-ul a parasit tab-ul
    2. cumulam timpul total cat a fost plecat
    3. la final, generam raport: "ai parasit de X ori, Y minute"
    4. penalizam XP pentru fiecare parasire
 
  IMPLEMENTARE TIMER: folosim setInterval cu pas de 1 secunda
  IMPORTANT: tinem pasul cu performance.now() pentru precizie
  (setInterval nu garanteaza interval exact!).
 */

import * as storage from './storage.js';
import { validateNumber } from './validator.js';

// stare timer
const STATE = {
  IDLE: 'idle',
  WORKING: 'working',
  BREAK: 'break',
  PAUSED: 'paused',
};

let state = STATE.IDLE;
let totalSeconds = 25 * 60;
let secondsLeft = 25 * 60;
let workDuration = 25 * 60;  // in secunde
let breakDuration = 5 * 60;
let intervalId = null;

// stats sesiune curenta (pentru raport)
let sessionStats = {
  startedAt: null,
  leaveCount: 0,
  totalAwayMs: 0,
  lastHiddenAt: null,
};

// lstener references - le pastram pentru cleanup -> prevenim memory leakage
let visibilityHandler = null;

/**
 * formateaza secunde ca MM:SS pentru afisare
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 update UI pe baza starii curente
 */
function render() {
  const display = document.getElementById('timer-display');
  const label = document.getElementById('timer-label');
  const timer = document.getElementById('timer');
  const progressBar = document.getElementById('timer-progress-bar');
  const startBtn = document.getElementById('btn-timer-start');

  if (display) display.textContent = formatTime(secondsLeft);

  if (label) {
    if (state === STATE.WORKING) label.textContent = 'studiu';
    else if (state === STATE.BREAK) label.textContent = 'pauza';
    else if (state === STATE.PAUSED) label.textContent = 'pauza scurta';
    else label.textContent = 'gata de start';
  }

  if (timer) {
    timer.classList.remove('timer--working', 'timer--break', 'timer--paused');
    if (state === STATE.WORKING) timer.classList.add('timer--working');
    else if (state === STATE.BREAK) timer.classList.add('timer--break');
    else if (state === STATE.PAUSED) timer.classList.add('timer--paused');
  }

  // cerc de progres SVG
  if (progressBar) {
    const totalForCircle = state === STATE.BREAK ? breakDuration : workDuration;
    const circumference = 2 * Math.PI * 48; // raza 48 in viewBox
    const progress = 1 - (secondsLeft / totalForCircle);
    const offset = circumference * progress;
    progressBar.style.strokeDasharray = String(circumference);
    progressBar.style.strokeDashoffset = String(offset);
  }

  // buton text dinamic
  if (startBtn) {
    if (state === STATE.IDLE) startBtn.textContent = 'Start';
    else if (state === STATE.PAUSED) startBtn.textContent = 'Continua';
    else startBtn.textContent = 'Pauza';
  }

  // ppdate titlu document
  document.title = state === STATE.IDLE
    ? 'Kaizen — Studiu, Concentrare, Crestere'
    : `${formatTime(secondsLeft)} — ${label?.textContent || ''} — Kaizen`;
}

/**
 * tick -> scade secundele si verifica daca am terminat
 */
function tick() {
  secondsLeft--;
  if (secondsLeft <= 0) {
    onSessionComplete();
    return;
  }
  render();
}

/**
  cand sesiunea de studiu sau pauza s-a terminat
 */
function onSessionComplete() {
  //orpim 
  clearInterval(intervalId);
  intervalId = null;

  if (state === STATE.WORKING) {
    // generam raport
    showFocusReport();

    // trecem in pauza
    state = STATE.BREAK;
    secondsLeft = breakDuration;
    totalSeconds = breakDuration;

    // eveniment pentru gamification (XP +10)
    document.dispatchEvent(new CustomEvent('focus-completed', {
      detail: {
        duration: workDuration,
        leaveCount: sessionStats.leaveCount,
        totalAwayMs: sessionStats.totalAwayMs,
      },
    }));

    notify('🎉 Sesiune completa!', 'Ia o pauza de ' + Math.round(breakDuration / 60) + ' minute.');

    // pornim automat pauza
    intervalId = setInterval(tick, 1000);
  } else if (state === STATE.BREAK) {
    // s-a terminat pauza - revenim in idle
    state = STATE.IDLE;
    secondsLeft = workDuration;
    totalSeconds = workDuration;

    notify('⏰ Pauza terminata', 'Gata de o noua sesiune?');
    detachVisibilityListener();
  }

  render();
}

/*
  trimite o notificare browser (daca user-ul a permis)
 */
function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch (err) {
    console.warn('[Focus] Eroare notificare:', err);
  }
}

/**
 * START sesiune noua de studiu
 */
function start() {
  // daca ream in pauza continuam de unde am ramas
  if (state === STATE.PAUSED) {
    state = STATE.WORKING;
    intervalId = setInterval(tick, 1000);
    render();
    return;
  }

  // daca rulam deja, butonul devine "pauza"
  if (state === STATE.WORKING) {
    pause();
    return;
  }

  // pornire de la zero
  state = STATE.WORKING;
  secondsLeft = workDuration;
  totalSeconds = workDuration;

  // reset stats sesiune
  sessionStats = {
    startedAt: Date.now(),
    leaveCount: 0,
    totalAwayMs: 0,
    lastHiddenAt: null,
  };

  attachVisibilityListener();
  intervalId = setInterval(tick, 1000);
  render();

  notify('🎯 Focus Mode activ', `Ai ${workDuration / 60} minute de studiu in fata.`);
}

/**
 * pauza temporara
 */
function pause() {
  if (state !== STATE.WORKING) return;
  state = STATE.PAUSED;
  clearInterval(intervalId);
  intervalId = null;
  render();
}

/**
 * reset complet la valorile initiale.
 */
function reset() {
  clearInterval(intervalId);
  intervalId = null;
  state = STATE.IDLE;
  secondsLeft = workDuration;
  totalSeconds = workDuration;
  detachVisibilityListener();
  render();
}

/*
  atasam listener pentru visibility cand incepe o sesiune
 */
function attachVisibilityListener() {
  if (visibilityHandler) return; // deja atasat
  visibilityHandler = () => {
    if (state !== STATE.WORKING) return;

    if (document.hidden) {
      // user-ul a parasit tab-ul!
      sessionStats.leaveCount++;
      sessionStats.lastHiddenAt = Date.now();

      // avertizam vizual cu un overlay rosu (apare cand revine)
      flagAsDistracted();

      // penalizare XP (-5)
      document.dispatchEvent(new CustomEvent('focus-distracted'));
    } else if (sessionStats.lastHiddenAt) {
      const awayMs = Date.now() - sessionStats.lastHiddenAt;
      sessionStats.totalAwayMs += awayMs;
      sessionStats.lastHiddenAt = null;

      // a fost detectata distragerea
      showDistractionWarning(Math.round(awayMs / 1000));
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

function detachVisibilityListener() {
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

/*
  flag intern (in storage) - utilizat pt achievement fara distragere
 */
function flagAsDistracted() {
  const stats = storage.get('focus-stats', { distractedCount: 0 });
  stats.distractedCount = (stats.distractedCount || 0) + 1;
  storage.set('focus-stats', stats);
}

/*
  afiseaza un toast de avertizare cand user-ul revine
 */
function showDistractionWarning(secondsAway) {
  document.dispatchEvent(new CustomEvent('toast', {
    detail: {
      msg: `⚠ Detectat: ai parasit ${secondsAway}s. -5 XP.`,
      type: 'warning',
    },
  }));
}

/*
  genereaza si afiseaza raportul de focus la finalul sesiunii.
 */
function showFocusReport() {
  const minutesWorked = Math.round(workDuration / 60);
  const leaveCount = sessionStats.leaveCount;
  const minutesAway = Math.round(sessionStats.totalAwayMs / 60000);

  // procent de focus
  const focusPercent = Math.max(0,
    100 - Math.round((sessionStats.totalAwayMs / (workDuration * 1000)) * 100)
  );

  // verdict (mesaj uman)
  let verdict;
  if (leaveCount === 0) verdict = 'Concentrare perfecta. Felicitari!';
  else if (leaveCount <= 2) verdict = 'Bine, dar putem si mai bine.';
  else verdict = 'Multe distrageri. Incearca sa pui telefonul departe.';

  // modal raport
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');

  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
    <h2 class="modal__title">Raport sesiune</h2>
    <div class="modal__body">
      <div style="text-align: center; padding: var(--space-4) 0;">
        <p class="text-mute" style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em;">
          Eficienta
        </p>
        <p class="text-display" style="font-size: 4rem; font-weight: 300; color: var(--accent-sage);">
          ${focusPercent}<span style="font-size: 2rem;">%</span>
        </p>
      </div>

      <div class="grid grid--3" style="gap: var(--space-2);">
        <div class="stat" style="padding: var(--space-2);">
          <span class="stat__label">Timp studiu</span>
          <span class="stat__value" style="font-size: var(--text-xl);">${minutesWorked}<span class="stat__value-unit">min</span></span>
        </div>
        <div class="stat" style="padding: var(--space-2);">
          <span class="stat__label">Distrageri</span>
          <span class="stat__value" style="font-size: var(--text-xl);">${leaveCount}</span>
        </div>
        <div class="stat" style="padding: var(--space-2);">
          <span class="stat__label">Timp pierdut</span>
          <span class="stat__value" style="font-size: var(--text-xl);">${minutesAway}<span class="stat__value-unit">min</span></span>
        </div>
      </div>

      <p class="text-soft" style="text-align: center; font-style: italic; margin-top: var(--space-3);">
        ${verdict}
      </p>
    </div>
    <div class="modal__footer">
      <button class="btn btn--primary" id="btn-report-close">Inteles</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  modal.querySelector('#btn-report-close').onclick = () => {
    document.body.removeChild(backdrop);
  };

  // salvam raportul in storage pentru istoric
  const reports = storage.get('focus-reports', []);
  reports.push({
    date: new Date().toISOString(),
    duration: workDuration,
    leaveCount,
    totalAwayMs: sessionStats.totalAwayMs,
    focusPercent,
  });
  // pstram doar ultimele 50 (nu suprasolicitam storage-ul)
  storage.set('focus-reports', reports.slice(-50));
}

/*
  initializare modul
 */
export function init() {
  // citim setarile salvate
  const settings = storage.get('pomodoro-settings', { work: 25, break: 5 });
  workDuration = settings.work * 60;
  breakDuration = settings.break * 60;
  secondsLeft = workDuration;
  totalSeconds = workDuration;

  // update inputuri pe baza setarilor
  const workInput = document.getElementById('pomodoro-work');
  const breakInput = document.getElementById('pomodoro-break');
  if (workInput) workInput.value = settings.work;
  if (breakInput) breakInput.value = settings.break;

  // listeners pentru schimbari de setari
  if (workInput) {
    workInput.addEventListener('change', (e) => {
      const r = validateNumber(e.target.value, { min: 5, max: 90, integer: true });
      if (r.valid) {
        workDuration = r.value * 60;
        if (state === STATE.IDLE) {
          secondsLeft = workDuration;
          render();
        }
        storage.set('pomodoro-settings', { work: r.value, break: settings.break });
      }
    });
  }
  if (breakInput) {
    breakInput.addEventListener('change', (e) => {
      const r = validateNumber(e.target.value, { min: 1, max: 30, integer: true });
      if (r.valid) {
        breakDuration = r.value * 60;
        storage.set('pomodoro-settings', { work: workDuration / 60, break: r.value });
      }
    });
  }

  const startBtn = document.getElementById('btn-timer-start');
  const resetBtn = document.getElementById('btn-timer-reset');
  if (startBtn) startBtn.addEventListener('click', start);
  if (resetBtn) resetBtn.addEventListener('click', reset);

  render();
}

/**
 * cleanup pentru cazul cand modulul e oprit
 * apelat la unload sau navigare (din app.js
 */
export function cleanup() {
  clearInterval(intervalId);
  detachVisibilityListener();
}
