import * as storage from './storage.js';
import { validateString, validateDate, generateId, escapeHTML } from './validator.js';
import { getSubjects } from './schedule.js';

const STORAGE_KEY = 'deadlines';
let reminderInterval = null;

/**
 * returneaza toate deadline-uril
 */
export function getAll() {
  const list = storage.get(STORAGE_KEY, []);
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * adauga un deadline nou.
 */
export function add({ title, date, type, subject }) {
  const titleR = validateString(title, { min: 1, max: 100, fieldName: 'Titlu' });
  if (!titleR.valid) return titleR;

  const dateR = validateDate(date, { allowPast: false, fieldName: 'Data' });
  if (!dateR.valid) return dateR;

  if (type !== 'tema' && type !== 'test') {
    return { valid: false, error: 'Tip invalid (tema sau test).' };
  }

  const list = getAll();
  list.push({
    id: generateId(),
    title: titleR.value,
    date: dateR.value,
    type,
    subject: subject || '',
    done: false,
    createdAt: new Date().toISOString(),
  });
  storage.set(STORAGE_KEY, list);
  return { valid: true };
}

/**
 *facut/nefacut.
 */
export function toggleDone(id) {
  const list = getAll();
  const item = list.find((d) => d.id === id);
  if (item) {
    item.done = !item.done;
    storage.set(STORAGE_KEY, list);

    if (item.done) {
      // XP
      document.dispatchEvent(new CustomEvent('task-completed', { detail: item }));
    }
  }
}

/**
 * sterge un deadline.
 */
export function remove(id) {
  const list = getAll().filter((d) => d.id !== id);
  storage.set(STORAGE_KEY, list);
}

export function daysUntil(dateStr) {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target - today;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 *nivelul de urgenta (pentru styling).
 */
function urgencyLevel(daysLeft, done) {
  if (done) return 'done';
  if (daysLeft < 0) return 'urgent'; // trecut, dar nu marcat
  if (daysLeft <= 1) return 'urgent';
  if (daysLeft <= 3) return 'soon';
  return '';
}

/**
 * verifica deadline-urile apropiate si trimite notificri browser
 */
function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const list = getAll().filter((d) => !d.done);
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  // anti-spam
  const notified = storage.get('notified-today', { date: todayKey, ids: [] });
  if (notified.date !== todayKey) {
    notified.date = todayKey;
    notified.ids = [];
  }

  list.forEach((d) => {
    const days = daysUntil(d.date);
    if (days >= 0 && days <= 1 && !notified.ids.includes(d.id)) {
      // Trm notificare
      try {
        new Notification('Kaizen — Reminder', {
          body: `${d.type === 'test' ? '📝 Test' : '📚 Tema'}: ${d.title} — ${days === 0 ? 'AZI' : 'MAINE'}`,
          icon: '/favicon.ico',
          tag: d.id, // tag unic = nu spamam cu duplicate
        });
        notified.ids.push(d.id);
      } catch (err) {
        console.warn('[Calendar] Eroare notificare:', err);
      }
    }
  });

  storage.set('notified-today', notified);
}

/**
 * lista de deadline-uri.
 * IMPORTANT!!!! cleanup la fiecare render pentru a evita memory leaks.
 */
export function renderList(container) {
  if (!container) return;

  // curatam complet (atat dom cat si listenerii sunt eliminati cu nodurile)
  container.innerHTML = '';

  const list = getAll();
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-mute';
    empty.style.fontSize = 'var(--text-sm)';
    empty.textContent = 'Nicio tema sau test in calendar. Click "+ Adauga" pentru a incepe.';
    container.appendChild(empty);
    return;
  }

  list.forEach((d) => {
    const days = daysUntil(d.date);
    const urgency = urgencyLevel(days, d.done);

    const item = document.createElement('div');
    item.className = 'deadline';
    if (urgency) item.className += ` deadline--${urgency}`;
    item.setAttribute('role', 'listitem');

    // afisaj scurt: ZZ/LL
    const dateDiv = document.createElement('div');
    dateDiv.className = 'deadline__date';
    const dateObj = new Date(d.date);
    const dayNum = document.createElement('span');
    dayNum.className = 'deadline__date-day';
    dayNum.textContent = String(dateObj.getDate()).padStart(2, '0');
    const monthSpan = document.createElement('span');
    monthSpan.textContent = dateObj.toLocaleDateString('ro-RO', { month: 'short' });
    dateDiv.append(dayNum, monthSpan);

    // continut principal
    const content = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'deadline__title';
    title.textContent = d.title;
    if (d.done) title.style.textDecoration = 'line-through';

    const meta = document.createElement('div');
    meta.className = 'deadline__meta';

    let metaText = `${d.type === 'test' ? 'Test' : 'Tema'}`;
    if (d.subject) metaText += ` · ${d.subject}`;
    if (!d.done) {
      if (days < 0) metaText += ` · ⚠ a trecut`;
      else if (days === 0) metaText += ` · AZI`;
      else if (days === 1) metaText += ` · maine`;
      else metaText += ` · ${days} zile`;
    } else {
      metaText += ` · ✓ facuta`;
    }
    meta.textContent = metaText;

    content.append(title, meta);

    // actiuni (toggle done, sterge)
    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'btn btn--ghost btn--sm';
    doneBtn.textContent = d.done ? '↺' : '✓';
    doneBtn.setAttribute('aria-label', d.done ? 'Marcheaza ca nefacut' : 'Marcheaza ca facut');
    doneBtn.onclick = () => {
      toggleDone(d.id);
      renderList(container);
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn--ghost btn--sm';
    delBtn.textContent = '×';
    delBtn.setAttribute('aria-label', 'Sterge');
    delBtn.onclick = () => {
      if (confirm(`Sterg "${d.title}"?`)) {
        remove(d.id);
        renderList(container);
      }
    };

    actions.append(doneBtn, delBtn);
    item.append(dateDiv, content, actions);
    container.appendChild(item);
  });
}

/**
 * modal pentru adaugare deadline.
 */
function openAddModal(onSuccess) {
  const subjects = getSubjects();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'modal';

  // data minima = azi
  const today = new Date().toISOString().slice(0, 10);

  modal.innerHTML = `
    <h2 class="modal__title">Adauga tema sau test</h2>
    <div class="modal__body">
      <div class="field">
        <label class="field__label" for="dl-title">Titlu</label>
        <input type="text" class="input" id="dl-title" maxlength="100" required />
      </div>
      <div class="flex gap-2">
        <div class="field" style="flex: 1;">
          <label class="field__label" for="dl-date">Data</label>
          <input type="date" class="input" id="dl-date" min="${today}" required />
        </div>
        <div class="field" style="flex: 1;">
          <label class="field__label" for="dl-type">Tip</label>
          <select class="select" id="dl-type">
            <option value="tema">Tema</option>
            <option value="test">Test</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="dl-subject">Materie (optional)</label>
        <select class="select" id="dl-subject">
          <option value="">— niciuna —</option>
          ${subjects.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('')}
        </select>
      </div>
      <p class="field__error" id="dl-error" role="alert"></p>
    </div>
    <div class="modal__footer">
      <button class="btn btn--ghost" id="btn-dl-cancel">Anuleaza</button>
      <button class="btn btn--primary" id="btn-dl-save">Adauga</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Auto focus pe primul input pentru UX bun
  setTimeout(() => modal.querySelector('#dl-title').focus(), 100);

  const cleanup = () => document.body.removeChild(backdrop);
  modal.querySelector('#btn-dl-cancel').onclick = cleanup;

  backdrop.onclick = (e) => {
    if (e.target === backdrop) cleanup();
  };

  // esc handler
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      cleanup();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  modal.querySelector('#btn-dl-save').onclick = () => {
    const errorEl = modal.querySelector('#dl-error');
    errorEl.textContent = '';

    const result = add({
      title: modal.querySelector('#dl-title').value,
      date: modal.querySelector('#dl-date').value,
      type: modal.querySelector('#dl-type').value,
      subject: modal.querySelector('#dl-subject').value,
    });

    if (!result.valid) {
      errorEl.textContent = result.error;
      return;
    }

    cleanup();
    if (onSuccess) onSuccess();
    document.removeEventListener('keydown', escHandler);
  };
}

/**
  initializare modul
 */
export function init() {
  const list = document.getElementById('deadlines-list');
  renderList(list);

  const addBtn = document.getElementById('btn-add-deadline');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openAddModal(() => {
        renderList(list);
        document.dispatchEvent(new CustomEvent('toast', {
          detail: { msg: 'Adaugat in calendar', type: 'success' },
        }));
      });
    });
  }

  // cleanup vechiului interval daca init e apelat din nou (defensive)
  if (reminderInterval) clearInterval(reminderInterval);
  checkReminders(); // imediat o data
  reminderInterval = setInterval(checkReminders, 5 * 60 * 1000);
}
