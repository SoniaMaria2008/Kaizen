/*
   gamification.js — reward system

   modulul reactioneaza la evenimente custom dispatchate de
   celelalte module:
     - "task-completed" -> +20 XP
     - "focus-completed"-> +10 XP, sesiunea conteaza la stats
     - "focus-distracted"-> -5 XP (penalizare ies din tab)
     - "grade-added" -> +5 XP (pentru ca a notat ceva)

   streak-ul: zile consecutive cu activitate (orice eveniment
   care da XP). Daca azi e prima activitate dupa o zi sarita,
   streak-ul se reseteaza la 1.

   Niveluri: praguri exponential-usoare. Nu vrem ca un elev sa
   simta ca stagneaza, dar nici sa ajunga la nivelul max in
   doua zile.

   Achievements: 9 trofee, fiecare cu o conditie clara. Sunt
   verificate dupa fiecare modificare de XP/streak/sesiuni. */

import * as storage from './storage.js';
import { escapeHTML } from './validator.js';


/*NIVELURI*/
const LEVELS = [
  { name: 'Boboc',         min: 0 },
  { name: 'Aspirant',      min: 100 },
  { name: 'Diligent',      min: 250 },
  { name: 'Studios',       min: 500 },
  { name: 'Maestru',       min: 1000 },
  { name: 'Sensei',        min: 2000 },
  { name: 'Iluminat',      min: 4000 }
];


/* getLevel(xp): returneaza obiectul {index, level, nextLevel}.
   index e 0-based pentru array, dar afisam +1 in UI */
function getLevel(xp) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].min) idx = i;
  }
  return {
    index: idx,
    level: LEVELS[idx],
    nextLevel: LEVELS[idx + 1] || null
  };
}


/*
   ACHIEVEMENTS

   fiecare achievement are:
     - id  : unic, salvat in storage cand e deblocat
     - name: numele afisat
     - desc: descriere scurta
     - icon: emoji
     - check(stats): returneaza true daca conditiile sunt indeplinite
*/
const ACHIEVEMENTS = [
  {
    id: 'first-step',
    name: 'Primul pas',
    desc: 'Castiga primii 10 XP',
    icon: '🌱',
    check: (s) => s.xp >= 10
  },
  {
    id: 'first-pomodoro',
    name: 'Prima sesiune',
    desc: 'Termina prima sesiune Pomodoro',
    icon: '🍅',
    check: (s) => s.sessions >= 1
  },
  {
    id: 'streak-3',
    name: 'Constant',
    desc: 'Streak de 3 zile',
    icon: '🔥',
    check: (s) => s.streak >= 3
  },
  {
    id: 'streak-7',
    name: 'O saptamana',
    desc: 'Streak de 7 zile',
    icon: '⭐',
    check: (s) => s.streak >= 7
  },
  {
    id: 'streak-30',
    name: 'Disciplina',
    desc: 'Streak de 30 de zile',
    icon: '🏆',
    check: (s) => s.streak >= 30
  },
  {
    id: 'tasks-10',
    name: 'Productiv',
    desc: 'Bifeaza 10 teme/teste',
    icon: '✅',
    check: (s) => s.tasks >= 10
  },
  {
    id: 'sessions-25',
    name: 'Maraton',
    desc: 'Termina 25 de sesiuni Pomodoro',
    icon: '🎯',
    check: (s) => s.sessions >= 25
  },
  {
    id: 'level-3',
    name: 'In ascensiune',
    desc: 'Atinge nivelul 3',
    icon: '📈',
    check: (s) => getLevel(s.xp).index >= 2
  },
  {
    id: 'xp-1000',
    name: 'Milionar de XP',
    desc: 'Aduna 1000 XP',
    icon: '💎',
    check: (s) => s.xp >= 1000
  }
];


/* STATE AND STORAGE*/

/* getStats(): citeste tot ce ne intereseaza din storage cu
   default-uri sigure Daca cineva a alterat localStorage manual,
   getStats() inca returneaza un obiect valid*/
function getStats() {
  return {
    xp:        Math.max(0, parseInt(storage.get('xp', 0), 10) || 0),
    streak:    Math.max(0, parseInt(storage.get('streak', 0), 10) || 0),
    sessions:  Math.max(0, parseInt(storage.get('sessions', 0), 10) || 0),
    tasks:     Math.max(0, parseInt(storage.get('tasks', 0), 10) || 0),
    lastDate:  storage.get('last-activity-date', null),
    unlocked:  storage.get('achievements', [])
  };
}


/* todayKey(): "2026-04-08" pentru data curenta */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


/* yesterdayKey(): pentru a verifica daca streak-ul continua */
function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


/* updateStreak(): apelat la fiecare activitate
Logica:
     - daca lastDate === today  -> nu schimbam nimic
     - daca lastDate === yesterday -> streak++
     - altfel (gap sau prima data) -> streak = 1
   Apoi actualizam lastDate la today */
function updateStreak() {
  const stats = getStats();
  const today = todayKey();
  const yesterday = yesterdayKey();

  let newStreak = stats.streak;
  if (stats.lastDate === today) {
    /* ddeja activ azi — nimic de facut */
    return;
  } else if (stats.lastDate === yesterday) {
    newStreak = stats.streak + 1;
  } else {
    /* prima oara sau gap */
    newStreak = 1;
  }

  storage.set('streak', newStreak);
  storage.set('last-activity-date', today);
}


/* addXP(amount, reason): single point of mutation pentru XP
   amount poate fi negativ (penalizare)*/
function addXP(amount, reason = '') {
  const current = parseInt(storage.get('xp', 0), 10) || 0;
  const next = Math.max(0, current + amount);

  /* detectam level-up pentru a notifica utilizatorul */
  const oldLevel = getLevel(current).index;
  const newLevel = getLevel(next).index;

  storage.set('xp', next);

  if (amount > 0) updateStreak();

  /* toast — gain sau loss */
  const sign = amount > 0 ? '+' : '';
  const type = amount > 0 ? 'success' : 'warning';
  document.dispatchEvent(new CustomEvent('toast', {
    detail: {
      msg: `${sign}${amount} XP${reason ? ' — ' + reason : ''}`,
      type
    }
  }));

  if (newLevel > oldLevel) {
    /* level-up dupa o scurta intarziere ca toast-urile sa nu se suprapuna */
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('toast', {
        detail: {
          msg: `🎉 Nivel nou: ${LEVELS[newLevel].name}!`,
          type: 'success'
        }
      }));
    }, 600);
  }

  checkAchievements();
  render();
}


/* incCounter(key): incrementeaza un contor (sessions, tasks) */
function incCounter(key) {
  const v = parseInt(storage.get(key, 0), 10) || 0;
  storage.set(key, v + 1);
}


/* ACHIEVEMENTS — verificare & notificare */

function checkAchievements() {
  const stats = getStats();
  const unlocked = new Set(stats.unlocked);
  let newlyUnlocked = [];

  for (const ach of ACHIEVEMENTS) {
    if (!unlocked.has(ach.id) && ach.check(stats)) {
      unlocked.add(ach.id);
      newlyUnlocked.push(ach);
    }
  }

  if (newlyUnlocked.length > 0) {
    storage.set('achievements', Array.from(unlocked));
    /* toast pentru fiecare achievement nou */
    newlyUnlocked.forEach((ach, i) => {
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('toast', {
          detail: {
            msg: `${ach.icon} Achievement: ${ach.name}`,
            type: 'success'
          }
        }));
      }, 800 * (i + 1));
    });
  }
}


/* renderHeader(): badge-ul din coltul dreapta-sus */
function renderHeader() {
  const stats = getStats();
  const xpEl = document.getElementById('header-xp-value');
  const streakEl = document.getElementById('header-streak-value');
  if (xpEl) xpEl.textContent = stats.xp;
  if (streakEl) streakEl.textContent = stats.streak;
}


/* renderRewardsSection(): card-ul cu nivel stats si achievements */
function renderRewardsSection() {
  const stats = getStats();
  const lvl = getLevel(stats.xp);

  const nameEl = document.getElementById('level-name');
  const numEl = document.getElementById('level-number');
  if (nameEl) nameEl.textContent = lvl.level.name;
  if (numEl) numEl.textContent = String(lvl.index + 1);

  /* bara progres XP catre nivelul urmator */
  const xpEl = document.getElementById('level-xp');
  const nextEl = document.getElementById('level-next-xp');
  const progressEl = document.getElementById('level-progress');

  if (lvl.nextLevel) {
    const min = lvl.level.min;
    const max = lvl.nextLevel.min;
    const pct = Math.min(100, Math.round(((stats.xp - min) / (max - min)) * 100));
    if (xpEl) xpEl.textContent = stats.xp;
    if (nextEl) nextEl.textContent = max;
    if (progressEl) progressEl.style.width = pct + '%';
  } else {
    /* nivel maxim atins */
    if (xpEl) xpEl.textContent = stats.xp;
    if (nextEl) nextEl.textContent = '∞';
    if (progressEl) progressEl.style.width = '100%';
  }

  /* stats numerice */
  const streakEl = document.getElementById('stat-streak');
  const sessionsEl = document.getElementById('stat-sessions');
  const tasksEl = document.getElementById('stat-tasks');
  if (streakEl) streakEl.textContent = stats.streak;
  if (sessionsEl) sessionsEl.textContent = stats.sessions;
  if (tasksEl) tasksEl.textContent = stats.tasks;

  /* grid achievements*/
  const grid = document.getElementById('achievements-grid');
  const count = document.getElementById('achievements-count');
  if (!grid) return;

  const unlocked = new Set(stats.unlocked);
  grid.innerHTML = '';

  ACHIEVEMENTS.forEach((ach) => {
    const isUnlocked = unlocked.has(ach.id);
    const card = document.createElement('div');
    card.className = 'achievement' + (isUnlocked ? ' achievement--unlocked' : '');
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label',
      `${ach.name}: ${ach.desc}. ${isUnlocked ? 'Deblocat' : 'Blocat'}`);

    const icon = document.createElement('div');
    icon.className = 'achievement__icon';
    icon.textContent = isUnlocked ? ach.icon : '🔒';
    card.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'achievement__name';
    name.textContent = ach.name;
    card.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'achievement__desc';
    desc.textContent = ach.desc;
    card.appendChild(desc);

    grid.appendChild(card);
  });

  if (count) {
    count.textContent = `${unlocked.size}/${ACHIEVEMENTS.length} deblocate`;
  }
}


function render() {
  renderHeader();
  renderRewardsSection();
}


/* EVENT LISTENERS — reactionam la evenimente din alte module*/

function attachListeners() {
  
  document.addEventListener('focus-completed', () => {
    incCounter('sessions');
    addXP(10, 'Pomodoro terminat');
  });

  /* distrgere: a iesit din tab */
  document.addEventListener('focus-distracted', () => {
    addXP(-5, 'Ai iesit din tab');
  });

  /* tema/test bifat. */
  document.addEventListener('task-completed', () => {
    incCounter('tasks');
    addXP(20, 'Tema terminata');
  });

  /* nota adaugata*/
  document.addEventListener('grade-added', () => {
    addXP(5, 'Nota inregistrata');
  });
}


/* INIT PUBLIC*/

export function init() {
  attachListeners();
  render();
}

/* export ca sa poata fi apelat dupa import-all */
export function refresh() {
  render();
}
