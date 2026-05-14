/* ai-assistant.js — asistent pedagogic - gemini API */

import * as storage from './storage.js';

/* pt free */
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const DEFAULT_MODEL = 'gemini-2.5-flash';

/* chei localStorage. */
const SK_API_KEY = 'ai-api-key';
const SK_MODEL   = 'ai-model';
const SK_CHAT    = 'ai-chat';

/* limite */
const MAX_CONTEXT_MESSAGES = 20;
const MAX_INPUT_LEN = 2000;
const MAX_HISTORY_SAVED = 200; 


/*
   SYSTEM PROMPT — defineste comportamentul tutorelui
   acest text e cea mai importanta contributie originala: prin
   formularea sa, AI-ul nu mai e un LLM generic, ci un
   tutore specific aplicatiei Kaizen
*/

const SYSTEM_PROMPT = `Esti "Sensei", asistentul pedagogic al aplicatiei Kaizen.
Rolul tau: ajuti elevii romani de gimnaziu si liceu sa INVETE,
nu sa primeasca raspunsuri gata facute.

REGULI STRICTE DE COMPORTAMENT (nu le incalci niciodata):

1. NU oferi raspunsul direct la teme. Daca elevul intreaba
   "cat fac 2+2", il ghidezi sa gandeasca, nu spui "4".
2. Folosesti metoda socratica: pui intrebari care il fac sa
   descopere singur. Maxim 2 intrebari la rand.
3. Imparti problemele in pasi mici. Verifici intelegerea la
   fiecare pas inainte de a continua.
4. Lauzi EFORTUL si STRATEGIA, nu rezultatul brut.
   Spui "ai gandit corect ca trebuie sa..." nu "bravo, 10!".
5. Daca elevul insista pentru raspunsul direct, ii explici
   politicos de ce nu e in interesul lui, apoi oferi o
   "schita" cu spatii goale pe care sa le completeze el.
6. Folosesti exemple concrete din viata cotidiana cand explici
   concepte abstracte.
7. Vorbesti EXCLUSIV in romana. Prietenos, dar nu copilaresc.
   Te adresezi cu "tu".
8. Pentru matematica, folosesti notatie clara: x^2, sqrt(x),
   liste numerotate pentru pasi. NU folosesti LaTeX complex.
9. Daca elevul greseste, NU spui doar "gresit". Intrebi
   "cum ai ajuns aici?" ca sa identificati impreuna unde
   s-a pierdut rationamentul.
10. La final de explicatie completa, propui o problema
    similara ca exercitiu de fixare.
11. Raspunsurile tale sunt SCURTE: 3-6 propozitii in mod
    obisnuit. Doar la cerere expresa ("explica-mi pe larg")
    raspunzi cu mai mult de un paragraf.
12. NU inventezi fapte. Daca nu stii ceva sigur, recunosti.

FORMAT:
- Foloseste **bold** pentru cuvinte cheie.
- Liste cu - sau 1. 2. 3. pentru pasi.
- Cod / formule in \`backtick-uri\`.

CONTEXTUL ELEVULUI (din aplicatia Kaizen — folosit pentru personalizare):
{CONTEXT}

Foloseste contextul cu masura: daca elevul intreaba ceva
nelegat de materiile lui, raspunzi normal. Dar daca observi
ca intrebarea atinge o materie unde elevul are dificultati
(media sub 7), incepi prin a confirma ca intelegi de unde
vine intrebarea si lucrezi cu rabdare extra.`;


/*STARE*/

let chatHistory = [];       // [{role: 'user'|'assistant', content: string}]
let isLoading = false;

/* DOM refs */
let messagesEl = null;
let inputEl = null;
let formEl = null;
let sendBtn = null;
let clearBtn = null;
let statusEl = null;

function loadChatHistory() {
  const saved = storage.get(SK_CHAT, []);
  if (Array.isArray(saved)) {
    /* filtru anti date corupte */
    chatHistory = saved
      .filter(m => m && typeof m.role === 'string'
                     && typeof m.content === 'string'
                     && (m.role === 'user' || m.role === 'assistant'))
      .slice(-MAX_HISTORY_SAVED);
  } else {
    chatHistory = [];
  }
}

function saveChatHistory() {
  const trimmed = chatHistory.slice(-MAX_HISTORY_SAVED);
  storage.set(SK_CHAT, trimmed);
}

function clearChatHistory() {
  chatHistory = [];
  storage.set(SK_CHAT, []);
  if (messagesEl) {
    messagesEl.innerHTML = '';
    renderWelcomeMessage();
  }
}


/*GESTIONARE CHEIE API!!!!*/

function getApiKey() {
  return storage.get(SK_API_KEY, '');
}

function setApiKey(key) {
  storage.set(SK_API_KEY, (key || '').trim());
  updateStatusBadge();
}

function promptForApiKey() {
  const existing = getApiKey();
  const msg = existing
    ? 'Cheia API curenta este stocata. Introdu una noua (sau anuleaza pentru a o pastra):'
    : 'Introdu cheia ta Gemini API (gratuita la aistudio.google.com):';
  const input = window.prompt(msg, existing || '');
  if (input === null) return null;            // anulare
  const trimmed = input.trim();
  if (!trimmed) return null;
  setApiKey(trimmed);
  return trimmed;
}


/* context despre elev */

function buildStudentContext() {
  try {
    const subjects = storage.get('subjects', []);
    const gradesAll = storage.get('grades', {});
    const deadlines = storage.get('deadlines', []);

    /* mediile pe materie */
    const averages = {};
    for (const subject of subjects) {
      const list = gradesAll[subject] || [];
      if (Array.isArray(list) && list.length > 0) {
        const valid = list.filter(g => typeof g === 'number' && isFinite(g));
        if (valid.length > 0) {
          const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
          averages[subject] = Math.round(avg * 100) / 100;
        }
      }
    }

    /* materia cea mai slaba (daca exista date suficiente)*/
    let weakest = null;
    let lowest = Infinity;
    for (const [subj, avg] of Object.entries(averages)) {
      if (avg < lowest) { lowest = avg; weakest = subj; }
    }

    /* deadline-uri in urmatoarele 7 zile */
    const today = new Date().toISOString().slice(0, 10);
    const weekLater = new Date(Date.now() + 7 * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    const upcoming = (Array.isArray(deadlines) ? deadlines : [])
      .filter(d => d && d.date >= today && d.date <= weekLater)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);

    /* construim textul */
    const parts = [];

    if (subjects.length > 0) {
      parts.push(`- Materii studiate: ${subjects.join(', ')}.`);
    } else {
      parts.push('- Elevul nu a introdus inca materii in aplicatie.');
    }

    if (Object.keys(averages).length > 0) {
      const list = Object.entries(averages)
        .map(([s, a]) => `${s} ${a}`)
        .join('; ');
      parts.push(`- Medii curente: ${list}.`);
    }

    if (weakest && lowest < 7.5) {
      parts.push(`- Punct slab: ${weakest} (media ${lowest}). ` +
                 `Aplica rabdare extra la intrebari din aceasta materie.`);
    }

    if (upcoming.length > 0) {
      const list = upcoming
        .map(d => `${d.title || 'fara titlu'} (${d.type || 'tema'}, ${d.date})`)
        .join('; ');
      parts.push(`- Deadline-uri in urmatoarele 7 zile: ${list}.`);
    }

    return parts.join('\n');
  } catch (e) {

    return '- Context nedisponibil.';
  }
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function renderMarkdown(text) {
 
  let html = escapeHTML(text);

  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (m, lang, code) => {
    const trimmed = code.replace(/^\n+|\n+$/g, '');
    return `<pre><code>${trimmed}</code></pre>`;
  });

  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  const lines = html.split('\n');
  const out = [];
  let listType = null;        // 'ul' / 'ol' / null

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    const ulMatch = line.match(/^[\-*]\s+(.+)$/);
    const olMatch = line.match(/^\d+\.\s+(.+)$/);

    if (ulMatch) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${olMatch[1]}</li>`);
    } else {
      closeList();
      out.push(line);
    }
  }
  closeList();
  html = out.join('\n');

  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = `<p>${html}</p>`;

  html = html.replace(/<p>\s*(<(?:ul|ol|pre)>)/g, '$1');
  html = html.replace(/(<\/(?:ul|ol|pre)>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}


/* APEL GEMINI API */

async function callGeminiAPI(messages, apiKey, systemPrompt, model) {
  const url = `${GEMINI_URL}/${model}:generateContent`;

  const trimmed = messages.slice(-MAX_CONTEXT_MESSAGES);

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: trimmed.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.7,        // putin creativitate, dar coerent
      maxOutputTokens: 800,    // raspunsuri scurte
      topP: 0.95,
    },
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (netErr) {
    throw new Error('Nu pot ajunge la server. Verifici conexiunea?');
  }

  if (!res.ok) {
    let detail = `Eroare API (${res.status})`;
    try {
      const errData = await res.json();
      if (errData?.error?.message) detail = errData.error.message;
    } catch { /* ignore */ }

    if (res.status === 400 && /API key/i.test(detail)) {
      throw new Error('Cheie API invalida. Verifici cheia in setari.');
    }
    if (res.status === 403) {
      throw new Error('Cheia nu are acces la acest model.');
    }
    if (res.status === 429) {
      throw new Error('Ai depasit limita de cereri. Asteapta un minut.');
    }
    throw new Error(detail);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error('Niciun raspuns de la AI.');

  if (candidate.finishReason === 'SAFETY') {
    throw new Error('Raspunsul a fost blocat de filtrele de siguranta.');
  }
  if (candidate.finishReason === 'RECITATION') {
    throw new Error('Raspunsul a fost respins ca posibil plagiat.');
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Raspuns gol de la AI.');

  return text.trim();
}


/* RENDERING UI */

function renderMessage(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `chat__msg chat__msg--${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat__bubble';

  if (role === 'assistant') {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function renderLoadingMessage() {
  const wrap = document.createElement('div');
  wrap.className = 'chat__msg chat__msg--assistant chat__msg--loading';

  const bubble = document.createElement('div');
  bubble.className = 'chat__bubble';
  bubble.innerHTML = '<span class="chat__dot"></span>' +
                     '<span class="chat__dot"></span>' +
                     '<span class="chat__dot"></span>';

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function renderErrorMessage(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'chat__msg chat__msg--error';

  const bubble = document.createElement('div');
  bubble.className = 'chat__bubble';
  bubble.textContent = '⚠ ' + msg;

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function renderWelcomeMessage() {
  const hasKey = !!getApiKey();
  const text = hasKey
    ? 'Salut! Sunt **Sensei**, asistentul tau pedagogic. Spune-mi cu ce te ajut: vrei sa intelegi un concept, sa exersezi pe o problema, sau sa-ti faci un plan de studiu?'
    : 'Salut! Sunt **Sensei**, asistentul tau pedagogic. Pentru a discuta, am nevoie de o cheie Gemini API gratuita. Apasa butonul "Setari" de mai jos sa o introduci.';
  renderMessage('assistant', text);
}

function renderAllHistory() {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  if (chatHistory.length === 0) {
    renderWelcomeMessage();
    return;
  }
  for (const msg of chatHistory) {
    renderMessage(msg.role, msg.content);
  }
}

function scrollToBottom() {
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateStatusBadge() {
  if (!statusEl) return;
  const hasKey = !!getApiKey();
  const model = storage.get(SK_MODEL, DEFAULT_MODEL);
  statusEl.textContent = hasKey
    ? `${model} · cheie configurata`
    : 'cheie API neconfigurata';
  statusEl.classList.toggle('text-mute', !hasKey);
}

async function handleSubmit(text) {
  text = (text || '').trim();
  if (!text || isLoading) return;

  if (text.length > MAX_INPUT_LEN) {
    renderErrorMessage(`Mesajul e prea lung (max ${MAX_INPUT_LEN} caractere).`);
    return;
  }

  /* asigura cheie API */
  let apiKey = getApiKey();
  if (!apiKey) {
    apiKey = promptForApiKey();
    if (!apiKey) {
      renderErrorMessage('Ai nevoie de o cheie API pentru a continua.');
      return;
    }
  }

  /* adauga mesajul userylui*/
  chatHistory.push({ role: 'user', content: text });
  renderMessage('user', text);
  saveChatHistory();
  inputEl.value = '';
  autoResizeInput();

  isLoading = true;
  sendBtn.disabled = true;
  sendBtn.textContent = '...';
  const loadingEl = renderLoadingMessage();

  try {
    const context = buildStudentContext();
    const fullSystemPrompt = SYSTEM_PROMPT.replace('{CONTEXT}', context);
    const model = storage.get(SK_MODEL, DEFAULT_MODEL);

    const reply = await callGeminiAPI(
      chatHistory, apiKey, fullSystemPrompt, model
    );

    loadingEl.remove();
    chatHistory.push({ role: 'assistant', content: reply });
    renderMessage('assistant', reply);
    saveChatHistory();
  } catch (err) {
    loadingEl.remove();
    renderErrorMessage(err.message || 'Ceva nu a mers.');
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Trimite';
    inputEl.focus();
  }
}

function handleClear() {
  if (!window.confirm('Stergi toata conversatia? Aceasta actiune nu poate fi anulata.')) {
    return;
  }
  clearChatHistory();
  document.dispatchEvent(new CustomEvent('toast', {
    detail: { msg: 'Conversatia a fost stearsa.', type: 'info' }
  }));
}

function handleConfigure() {
  const newKey = promptForApiKey();
  if (newKey) {
    document.dispatchEvent(new CustomEvent('toast', {
      detail: { msg: 'Cheia API a fost salvata.', type: 'success' }
    }));
    
    if (chatHistory.length === 0) {
      messagesEl.innerHTML = '';
      renderWelcomeMessage();
    }
  }
}

function autoResizeInput() {
  if (!inputEl) return;
  inputEl.style.height = 'auto';
  const newHeight = Math.min(inputEl.scrollHeight, 144);
  inputEl.style.height = newHeight + 'px';
}


/* INIT  */

export function initAIAssistant() {
  /* Refs. DOM */
  messagesEl = document.getElementById('ai-messages');
  inputEl    = document.getElementById('ai-input');
  formEl     = document.getElementById('ai-form');
  sendBtn    = document.getElementById('ai-send');
  clearBtn   = document.getElementById('ai-clear');
  statusEl   = document.getElementById('ai-status');

  if (!messagesEl || !inputEl || !formEl) return;

  loadChatHistory();
  renderAllHistory();
  updateStatusBadge();

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit(inputEl.value);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSubmit(inputEl.value);
    }
  });

  inputEl.addEventListener('input', autoResizeInput);

  if (clearBtn)     clearBtn.addEventListener('click', handleClear);
  const configBtn = document.getElementById('ai-configure');
  if (configBtn)    configBtn.addEventListener('click', handleConfigure);

  const section = document.getElementById('section-ai');
  if (section) {
    const observer = new MutationObserver(() => {
      if (section.classList.contains('active')) {
        setTimeout(() => inputEl.focus(), 100);
      }
    });
    observer.observe(section, { attributes: true, attributeFilter: ['class'] });
  }
}
