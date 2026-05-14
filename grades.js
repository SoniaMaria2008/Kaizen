/*GRADES.JS - Calculator de medii + Predictor de Note*/

import * as storage from './storage.js';
import { validateGrade, escapeHTML } from './validator.js';
import { getSubjects } from './schedule.js';

const STORAGE_KEY = 'grades';

export function getAllGrades() {
  return storage.get(STORAGE_KEY, {});
}

/**
 * returneaza notele pentru o materie anume
 */
export function getGradesFor(subject) {
  const all = getAllGrades();
  return all[subject] || [];
}

/* adauga o nota la o materie
 */
export function addGrade(subject, value) {
  const result = validateGrade(value);
  if (!result.valid) return result;

  if (!subject || typeof subject !== 'string') {
    return { valid: false, error: 'Materie invalida.' };
  }

  const all = getAllGrades();
  if (!all[subject]) all[subject] = [];
  all[subject].push(result.value);
  storage.set(STORAGE_KEY, all);
  return { valid: true, value: result.value };
}

/*
 sterge o nota dupa index.
 */
export function removeGrade(subject, index) {
  const all = getAllGrades();
  if (all[subject] && all[subject][index] !== undefined) {
    all[subject].splice(index, 1);
    storage.set(STORAGE_KEY, all);
  }
}

/* calculeaza media pentru o lista de note*/
export function calculateAverage(grades) {
  if (!Array.isArray(grades) || grades.length === 0) return null;
  const sum = grades.reduce((a, b) => a + b, 0);
  // rotunjire la 2 zecimale (doar pentru afisare)
  return Math.round((sum / grades.length) * 100) / 100;
}

/**
 PREDICTOR 
 calculeaza nota minima necesara pentru media dorita
 */
export function predict(currentGrades, target, remaining) {
  if (!Array.isArray(currentGrades)) {
    return { feasible: false, reason: 'Date invalide.' };
  }
  if (target < 1 || target > 10) {
    return { feasible: false, reason: 'Media tinta trebuie intre 1 si 10.' };
  }
  if (remaining < 1) {
    return { feasible: false, reason: 'Numarul de note ramase trebuie ≥ 1.' };
  }

  const n = currentGrades.length;
  const currentSum = currentGrades.reduce((a, b) => a + b, 0);
  const totalCount = n + remaining;

  // suma necesara pentru media tinta
  const requiredSum = target * totalCount;
  // cat trebuie sa adunam din notele ramase
  const neededFromRemaining = requiredSum - currentSum;
  // media minima per nota viitoare
  const neededPerGrade = neededFromRemaining / remaining;

  // cazuri speciale
  if (neededPerGrade > 10) {
    return {
      feasible: false,
      reason: 'Imposibil: ar trebui sa iei mai mult de 10 la fiecare nota.',
      neededPerGrade: Math.round(neededPerGrade * 100) / 100,
    };
  }

  if (neededPerGrade <= 1) {
    return {
      feasible: true,
      easy: true,
      message: 'Ai deja media garantata, indiferent de notele viitoare!',
      currentAvg: n > 0 ? Math.round((currentSum / n) * 100) / 100 : null,
    };
  }

  return {
    feasible: true,
    neededPerGrade: Math.round(neededPerGrade * 100) / 100,
    currentAvg: n > 0 ? Math.round((currentSum / n) * 100) / 100 : null,
    targetAverage: target,
  };
}

/* cu textContent pentru securitate */
function populateSubjectSelect(selectEl) {
  if (!selectEl) return;

  const currentValue = selectEl.value;
  const subjects = getSubjects();

  // curatam si recream
  selectEl.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = subjects.length ? '— alege materie —' : '— adauga mai intai materii —';
  selectEl.appendChild(placeholder);

  subjects.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === currentValue) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

/* render-uieste sumarul mediilor (lista cu materii + media + nr note)
 */
function renderSummary(container) {
  if (!container) return;

  container.innerHTML = '';
  const all = getAllGrades();
  /* sortare lexicografica romaneasca, case-insensitive */
  const subjects = Object.keys(all)
    .filter((s) => all[s].length > 0)
    .sort((a, b) => a.localeCompare(b, 'ro', { sensitivity: 'base' }));

  if (subjects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-mute';
    empty.style.fontSize = 'var(--text-sm)';
    empty.textContent = 'Inca nicio nota. Adauga prima ta nota mai sus.';
    container.appendChild(empty);
    return;
  }

  subjects.forEach((subject) => {
    const grades = all[subject];
    const avg = calculateAverage(grades);

    const item = document.createElement('div');
    item.className = 'list-item';
    item.setAttribute('role', 'listitem');

    // construim DOM-ul cu textContent
    const main = document.createElement('div');
    main.className = 'list-item__main';

    const titleRow = document.createElement('div');
    titleRow.className = 'flex justify-between items-center gap-3';
    const title = document.createElement('span');
    title.className = 'list-item__title';
    title.textContent = subject;
    const avgSpan = document.createElement('span');
    avgSpan.className = 'text-display';
    avgSpan.style.fontSize = 'var(--text-lg)';
    avgSpan.style.fontWeight = '500';
    avgSpan.textContent = avg.toFixed(2);
    // culoare in functie de nota
    if (avg >= 9) avgSpan.style.color = 'var(--accent-sage)';
    else if (avg >= 7) avgSpan.style.color = 'var(--accent-sky)';
    else if (avg >= 5) avgSpan.style.color = 'var(--accent-sand)';
    else avgSpan.style.color = 'var(--accent-terracotta)';

    titleRow.append(title, avgSpan);

    const meta = document.createElement('span');
    meta.className = 'list-item__meta';
    meta.textContent = `${grades.length} ${grades.length === 1 ? 'nota' : 'note'}: ${grades.map((g) => g.toFixed(2)).join(', ')}`;

    main.append(titleRow, meta);
    item.appendChild(main);
    container.appendChild(item);
  });
}

/*
  render-uieste rezultatul predictiei
  folosim DOM API in loc de innerHTML pentru securitate
 */
function renderPrediction(container, result) {
  if (!container) return;
  container.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'predictor-result';
  if (!result.feasible) div.className += ' predictor-result--impossible';

  const main = document.createElement('p');
  main.className = 'predictor-result__main';

  const detail = document.createElement('p');
  detail.className = 'predictor-result__detail';

  if (!result.feasible) {
    main.textContent = '✗ Imposibil';
    detail.textContent = result.reason || '';
  } else if (result.easy) {
    main.textContent = '✓ Garantat!';
    detail.textContent = result.message || '';
  } else {
    main.textContent = `Trebuie minim ${result.neededPerGrade} la fiecare nota`;
    detail.textContent = `Media curenta: ${result.currentAvg ?? '—'} → tinta: ${result.targetAverage}`;
  }

  div.append(main, detail);
  container.appendChild(div);
}

/*lega toate event listener-ele si populeaza UI-ul initial
 */
export function init() {
  // selectoare materii
  const gradeSubjectSelect = document.getElementById('grade-subject');
  const predictSubjectSelect = document.getElementById('predict-subject');

  populateSubjectSelect(gradeSubjectSelect);
  populateSubjectSelect(predictSubjectSelect);

  // reactioneaza la modificari ale listei de materii (din schedule)
  document.addEventListener('subjects-changed', () => {
    populateSubjectSelect(gradeSubjectSelect);
    populateSubjectSelect(predictSubjectSelect);
  });

  // sumarul initial
  const summary = document.getElementById('grades-summary');
  renderSummary(summary);

  // adauga nota
  const btnAdd = document.getElementById('btn-add-grade');
  const errorEl = document.getElementById('grade-error');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      errorEl.textContent = '';

      const subject = gradeSubjectSelect.value;
      const valueInput = document.getElementById('grade-value');

      if (!subject) {
        errorEl.textContent = 'Selecteaza o materie.';
        return;
      }

      const result = addGrade(subject, valueInput.value);
      if (!result.valid) {
        errorEl.textContent = result.error;
        return;
      }

      valueInput.value = '';
      renderSummary(summary);

      // pt gamification (XP)
      document.dispatchEvent(new CustomEvent('grade-added', { detail: { subject, value: result.value } }));
      document.dispatchEvent(new CustomEvent('toast', {
        detail: { msg: `Nota ${result.value} adaugata`, type: 'success' },
      }));
    });
  }

  // buton predictor
  const btnPredict = document.getElementById('btn-predict');
  const predictResult = document.getElementById('predict-result');
  if (btnPredict) {
    btnPredict.addEventListener('click', () => {
      const subject = predictSubjectSelect.value;
      const target = parseFloat(document.getElementById('predict-target').value);
      const remaining = parseInt(document.getElementById('predict-remaining').value, 10);

      if (!subject) {
        predictResult.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'text-danger';
        p.style.fontSize = 'var(--text-sm)';
        p.textContent = 'Alege o materie.';
        predictResult.appendChild(p);
        return;
      }

      const grades = getGradesFor(subject);
      const result = predict(grades, target, remaining);
      renderPrediction(predictResult, result);
    });
  }
}
