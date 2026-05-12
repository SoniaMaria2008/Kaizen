/* SCHEDULE.JS - Management orar saptamanal
 
 Folosim indici 0-6 pentru zile (compatibil cu Date.getDay() in JS,
 * care returneaza 0=duminica, dar noi reordonam pentru luni-prima).
 */

import * as storage from './storage.js';
import { validateString, escapeHTML } from './validator.js';

const STORAGE_KEY = 'schedule';
const SUBJECTS_KEY = 'subjects';
const SLOTS_PER_DAY = 7; // Maxim 7 ore pe zi
const DAYS = ['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata', 'Duminica'];

/* returneaza orarul curent (cu fallback la structura goala) */
export function getSchedule() {
  return storage.get(STORAGE_KEY, {
    week: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
  });
}

/*returneaza lista de materii */
export function getSubjects() {
  return storage.get(SUBJECTS_KEY, []);
}

/* adauga o materie, nu duplicate, lungime rezonabila.*/
export function addSubject(name) {
  const result = validateString(name, { min: 1, max: 60, fieldName: 'Materie' });
  if (!result.valid) return result;

  const subjects = getSubjects();

  // unicitatea (case-insensitive)
  if (subjects.some((s) => s.toLowerCase() === result.value.toLowerCase())) {
    return { valid: false, error: 'Materia exista deja.' };
  }

  subjects.push(result.value);
  storage.set(SUBJECTS_KEY, subjects);
  return { valid: true, value: result.value };
}

/* sterge o materie din lista (si din toate sloturile orarului) */
export function removeSubject(name) {
  const subjects = getSubjects().filter((s) => s !== name);
  storage.set(SUBJECTS_KEY, subjects);

  // curatam si orarul - inlocuim cu null sloturile cu materia stearsa
  const sched = getSchedule();
  Object.keys(sched.week).forEach((day) => {
    sched.week[day] = sched.week[day].map((s) => (s === name ? null : s));
  });
  storage.set(STORAGE_KEY, sched);
}

export function setSlot(day, slot, subject) {
  if (day < 0 || day > 6 || slot < 0 || slot >= SLOTS_PER_DAY) {
    return { valid: false, error: 'Slot invalid.' };
  }

  const sched = getSchedule();
  if (!sched.week[day]) sched.week[day] = [];

  // asigura ca array-ul are dimensiunea corecta
  while (sched.week[day].length < SLOTS_PER_DAY) sched.week[day].push(null);

  sched.week[day][slot] = subject || null;
  storage.set(STORAGE_KEY, sched);
  return { valid: true };
}

/* returneaza ziua curenta (0-6, cu luni=0)..*/
export function getCurrentDayIndex() {
  const jsDay = new Date().getDay(); // 0=duminica, 1=luni,.., 6=sambata
  return jsDay === 0 ? 6 : jsDay - 1; // 0=luni, .., 6=duminica
}

/*returneaza materiile zilei curente, fara null-uri (sloturi goale)*/
export function getTodaySubjects() {
  const sched = getSchedule();
  const day = getCurrentDayIndex();
  return (sched.week[day] || []).filter((s) => s);
}

export function exportToFile() {
  const data = {
    version: 1,
    type: 'kaizen-schedule',
    exportedAt: new Date().toISOString(),
    schedule: getSchedule(),
    subjects: getSubjects(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kaizen-orar-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
export function importFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // validare structura
        if (data.type !== 'kaizen-schedule') {
          return resolve({ success: false, error: 'Tip de fisier necunoscut.' });
        }
        if (!data.schedule || !data.schedule.week) {
          return resolve({ success: false, error: 'Format orar invalid.' });
        }
        if (!Array.isArray(data.subjects)) {
          return resolve({ success: false, error: 'Lista materii invalida.' });
        }

        const cleanSubjects = data.subjects
          .filter((s) => typeof s === 'string')
          .map((s) => escapeHTML(s.trim()))
          .filter((s) => s.length > 0 && s.length <= 60);

        const cleanWeek = {};
        for (let day = 0; day < 7; day++) {
          const arr = data.schedule.week[day] || [];
          cleanWeek[day] = arr
            .slice(0, SLOTS_PER_DAY)
            .map((s) => (typeof s === 'string' ? escapeHTML(s.trim()) : null));
        }

        storage.set(SUBJECTS_KEY, cleanSubjects);
        storage.set(STORAGE_KEY, { week: cleanWeek });

        resolve({ success: true });
      } catch (err) {
        resolve({ success: false, error: 'Fisier corupt sau format invalid.' });
      }
    };

    reader.onerror = () => resolve({ success: false, error: 'Nu am putut citi fisierul.' });
    reader.readAsText(file);
  });
}
export function renderTodayList(container) {
  if (!container) return;

  const today = getTodaySubjects();
  const dayLabel = DAYS[getCurrentDayIndex()];

  // update label-ul zilei
  const dayLabelEl = document.getElementById('schedule-day-label');
  if (dayLabelEl) dayLabelEl.textContent = dayLabel;

  container.innerHTML = '';

  if (today.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-mute';
    empty.style.fontSize = 'var(--text-sm)';
    empty.textContent = 'Nicio materie astazi. Profita de timp!';
    container.appendChild(empty);
    return;
  }

  today.forEach((subject, i) => {
    const li = document.createElement('div');
    li.className = 'list-item';
    li.setAttribute('role', 'listitem');

    const main = document.createElement('div');
    main.className = 'list-item__main';
    const title = document.createElement('span');
    title.className = 'list-item__title';
    title.textContent = subject;
    const meta = document.createElement('span');
    meta.className = 'list-item__meta';
    meta.textContent = `Ora ${i + 1}`;
    main.append(title, meta);

    li.append(main);
    container.appendChild(li);
  });
}

export function openEditModal() {
  const subjects = getSubjects();
  const sched = getSchedule();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '700px';

  modal.innerHTML = `
    <h2 class="modal__title">Editeaza orarul</h2>
    <div class="modal__body">

      <div>
        <label class="field__label">Materii</label>
        <div id="subjects-list" class="flex gap-2" style="flex-wrap: wrap; margin-top: 0.5rem;"></div>
        <div class="flex gap-2 mt-2">
          <input type="text" class="input" id="new-subject" placeholder="Adauga materie..." maxlength="60" />
          <button class="btn btn--primary btn--sm" id="btn-add-subject">+</button>
        </div>
      </div>

      <div>
        <label class="field__label" style="margin-top: 1rem;">Orar saptamanal</label>
        <div style="overflow-x: auto;">
          <table class="schedule-table">
            <thead>
              <tr>
                <th>Ora</th>
                ${DAYS.map((d) => `<th>${escapeHTML(d.slice(0, 3))}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="schedule-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="modal__footer">
      <button class="btn btn--ghost" id="btn-modal-cancel">Anuleaza</button>
      <button class="btn btn--primary" id="btn-modal-save">Salveaza</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const renderSubjectsList = () => {
    const list = modal.querySelector('#subjects-list');
    list.innerHTML = '';
    getSubjects().forEach((s) => {
      const tag = document.createElement('span');
      tag.className = 'badge';
      tag.style.gap = '0.5rem';
      tag.textContent = s;
      const x = document.createElement('button');
      x.className = 'btn btn--ghost btn--sm';
      x.textContent = '×';
      x.style.padding = '0';
      x.style.minHeight = 'auto';
      x.setAttribute('aria-label', `Sterge ${s}`);
      x.onclick = () => {
        removeSubject(s);
        renderSubjectsList();
        renderTable();
      };
      tag.appendChild(x);
      list.appendChild(tag);
    });
  };

  const renderTable = () => {
    const tbody = modal.querySelector('#schedule-tbody');
    tbody.innerHTML = '';
    const currentSubjects = getSubjects();

    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const row = document.createElement('tr');
      const hourCell = document.createElement('td');
      hourCell.textContent = slot + 1;
      hourCell.style.fontWeight = '600';
      row.appendChild(hourCell);

      for (let day = 0; day < 7; day++) {
        const cell = document.createElement('td');
        const select = document.createElement('select');
        select.className = 'select';
        select.style.width = '100%';
        select.style.minHeight = '32px';
        select.style.fontSize = 'var(--text-xs)';

        select.innerHTML = `<option value="">—</option>`;
        currentSubjects.forEach((s) => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          if ((sched.week[day] || [])[slot] === s) opt.selected = true;
          select.appendChild(opt);
        });

        select.dataset.day = day;
        select.dataset.slot = slot;
        cell.appendChild(select);
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
  };

  renderSubjectsList();
  renderTable();

  const cleanup = () => {
    document.body.removeChild(backdrop);
  };

  modal.querySelector('#btn-add-subject').onclick = () => {
    const input = modal.querySelector('#new-subject');
    const result = addSubject(input.value);
    if (result.valid) {
      input.value = '';
      renderSubjectsList();
      renderTable();
    } else {
      alert(result.error);
    }
  };

  // enter pentru add quick
  modal.querySelector('#new-subject').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      modal.querySelector('#btn-add-subject').click();
    }
  };

  modal.querySelector('#btn-modal-cancel').onclick = cleanup;

  // click pe backdrop = inchide
  backdrop.onclick = (e) => {
    if (e.target === backdrop) cleanup();
  };

  // esc = inchide (a11y!)
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      cleanup();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  modal.querySelector('#btn-modal-save').onclick = () => {
    const newSched = { week: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } };
    modal.querySelectorAll('select[data-day]').forEach((s) => {
      const day = parseInt(s.dataset.day, 10);
      const slot = parseInt(s.dataset.slot, 10);
      if (!newSched.week[day]) newSched.week[day] = [];
      newSched.week[day][slot] = s.value || null;
    });
    storage.set(STORAGE_KEY, newSched);
    cleanup();

    
    const list = document.getElementById('schedule-today');
    if (list) renderTodayList(list);
    document.dispatchEvent(new CustomEvent('subjects-changed'));
  };
}
export function init() {
  const list = document.getElementById('schedule-today');
  renderTodayList(list);

  // Buton editare
  const editBtn = document.getElementById('btn-edit-schedule');
  if (editBtn) editBtn.addEventListener('click', openEditModal);

  // Export
  const exportBtn = document.getElementById('btn-export-schedule');
  if (exportBtn) exportBtn.addEventListener('click', exportToFile);

  // Import
  const importBtn = document.getElementById('btn-import-schedule');
  const fileInput = document.getElementById('schedule-file-input');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const result = await importFromFile(file);
      if (result.success) {
        renderTodayList(list);
        document.dispatchEvent(new CustomEvent('subjects-changed'));
        document.dispatchEvent(new CustomEvent('toast', {
          detail: { msg: 'Orar importat cu succes', type: 'success' },
        }));
      } else {
        document.dispatchEvent(new CustomEvent('toast', {
          detail: { msg: `Eroare import: ${result.error}`, type: 'danger' },
        }));
      }
      fileInput.value = ''; // reset pt reimporta acelasi fisier
    });
  }
}
