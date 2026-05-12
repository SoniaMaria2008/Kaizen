/*
   widgets.js — Widget-uri pentru modul Focuss

     1. Calculator stiintific (initCalculator)  -- complet rescris
     2. Citate motivationale  (initQuotes)
     3. Player audio simulat  (initAudio)

*/

import { escapeHTML } from './validator.js';
import * as storage from './storage.js';


/* calculator*/
   

const calcState = {
  expression: '',        
  history: [],           
  memory: 0,             
  hasMemory: false,       
  angleMode: 'deg',      
  justEvaluated: false,  
  hasError: false,       
};

let calcDisplay = null;
let calcHistoryEl = null;
let calcModeBadge = null;
let calcMemBadge = null;

const MAX_EXPR_LEN = 200;
const MAX_HISTORY = 20;
const MAX_HISTORY_DISPLAY = 5;

const SK_MEMORY  = 'calc-memory';
const SK_MEMFLAG = 'calc-mem-flag';
const SK_MODE    = 'calc-mode';
const SK_HISTORY = 'calc-history';

const FUNCTIONS = ['sin', 'cos', 'tan', 'sqrt', 'log', 'ln', 'exp'];
const CONSTANTS = { pi: Math.PI, e: Math.E };

function normalize(expr) {
  return expr
    .replace(/π/g, 'pi')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');
}

function tokenize(expr) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t') { i++; continue; }

    if (/[0-9.]/.test(ch)) {
      let num = '';
      let dotCount = 0;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === '.') {
          dotCount++;
          if (dotCount > 1) throw new Error('Numar cu doua zecimale');
        }
        num += expr[i++];
      }
      const n = parseFloat(num);
      if (!isFinite(n)) throw new Error('Numar invalid');
      tokens.push({ type: 'num', v: n });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let id = '';
      while (i < expr.length && /[a-zA-Z]/.test(expr[i])) {
        id += expr[i++];
      }
      const lower = id.toLowerCase();
      if (CONSTANTS[lower] !== undefined) {
        tokens.push({ type: 'num', v: CONSTANTS[lower] });
      } else if (FUNCTIONS.includes(lower)) {
        tokens.push({ type: 'func', v: lower });
      } else {
        throw new Error('Necunoscut: ' + id);
      }
      continue;
    }

    switch (ch) {
      case '+': case '-': case '*': case '/': case '^':
        tokens.push({ type: 'op', v: ch }); i++; continue;
      case '(':
        tokens.push({ type: 'lparen' }); i++; continue;
      case ')':
        tokens.push({ type: 'rparen' }); i++; continue;
      case '!':
        tokens.push({ type: 'postfix', v: '!' }); i++; continue;
      case '%':
        tokens.push({ type: 'postfix', v: '%' }); i++; continue;
    }

    
    throw new Error('Caracter invalid: ' + ch);
  }

  return tokens;
}

function insertImplicitMultiply(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    out.push(tokens[i]);
    if (i + 1 < tokens.length) {
      const cur = tokens[i];
      const next = tokens[i + 1];
      const curEnds =
        cur.type === 'num' || cur.type === 'rparen' || cur.type === 'postfix';
      const nextStarts =
        next.type === 'num' || next.type === 'func' || next.type === 'lparen';
      if (curEnds && nextStarts) {
        out.push({ type: 'op', v: '*' });
      }
    }
  }
  return out;
}


const PRECEDENCE = {
  '+': 1, '-': 1,
  '*': 2, '/': 2,
  'unary': 3,         
  '^': 4,                 // putere
};
const RIGHT_ASSOC = { '^': true, 'unary': true };

function shuntingYard(tokens) {
  const output = [];
  const stack  = [];
  let prev = null;

  for (let token of tokens) {
    if (token.type === 'op' && (token.v === '-' || token.v === '+')) {
      const isUnary = !prev
        || prev.type === 'op'
        || prev.type === 'unary'
        || prev.type === 'lparen'
        || prev.type === 'func';
      if (isUnary) {
        if (token.v === '+') { /* unar + e no-op */ continue; }
        token = { type: 'unary' };
      }
    }

    if (token.type === 'num') {
      output.push(token);
    } else if (token.type === 'func' || token.type === 'unary') {
      stack.push(token);
    } else if (token.type === 'postfix') {
      output.push(token);
    } else if (token.type === 'op') {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === 'lparen') break;
        let topPrec;
        if (top.type === 'func')       topPrec = 100;
        else if (top.type === 'unary') topPrec = PRECEDENCE['unary'];
        else                           topPrec = PRECEDENCE[top.v];
        const curPrec = PRECEDENCE[token.v];
        const rightAssoc = !!RIGHT_ASSOC[token.v];
        if (topPrec > curPrec || (topPrec === curPrec && !rightAssoc)) {
          output.push(stack.pop());
        } else break;
      }
      stack.push(token);
    } else if (token.type === 'lparen') {
      stack.push(token);
    } else if (token.type === 'rparen') {
      while (stack.length > 0 && stack[stack.length - 1].type !== 'lparen') {
        output.push(stack.pop());
      }
      if (stack.length === 0) throw new Error('Paranteza nepotrivita');
      stack.pop();   // arunca '('
      if (stack.length > 0 && stack[stack.length - 1].type === 'func') {
        output.push(stack.pop());
      }
    }

    prev = token;
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (top.type === 'lparen' || top.type === 'rparen') {
      throw new Error('Paranteza nepotrivita');
    }
    output.push(top);
  }

  return output;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Factorial: necesita intreg ≥ 0');
  }
  if (n > 170) throw new Error('Factorial prea mare');   // 171! = infinit
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function evaluateRPN(rpn, angleMode) {
  const stack = [];
  const toRad = (x) => angleMode === 'deg' ? x * Math.PI / 180 : x;

  for (const tok of rpn) {
    if (tok.type === 'num') {
      stack.push(tok.v);

    } else if (tok.type === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) {
        throw new Error('Expresie incompleta');
      }
      let r;
      switch (tok.v) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/':
          if (b === 0) throw new Error('Impartire la zero');
          r = a / b;
          break;
        case '^':
          /* (-2)^0.5 = NaN, refuzam explicit pentru mesaj clar. */
          if (a < 0 && !Number.isInteger(b)) {
            throw new Error('Numar negativ la putere ne-intreaga');
          }
          r = Math.pow(a, b);
          break;
      }
      if (!isFinite(r)) throw new Error('Rezultat infinit');
      if (isNaN(r))     throw new Error('Operatie invalida');
      stack.push(r);

    } else if (tok.type === 'unary') {
      const a = stack.pop();
      if (a === undefined) throw new Error('Expresie incompleta');
      stack.push(-a);

    } else if (tok.type === 'func') {
      const a = stack.pop();
      if (a === undefined) throw new Error('Expresie incompleta');
      let r;
      switch (tok.v) {
        case 'sin': r = Math.sin(toRad(a)); break;
        case 'cos': r = Math.cos(toRad(a)); break;
        case 'tan': {
          const rad = toRad(a);
          if (Math.abs(Math.cos(rad)) < 1e-15) {
            throw new Error('tan nedefinit (asimptota)');
          }
          r = Math.tan(rad);
          break;
        }
        case 'sqrt':
          if (a < 0) throw new Error('Radical din negativ');
          r = Math.sqrt(a);
          break;
        case 'log':
          if (a <= 0) throw new Error('log nedefinit (argument ≤ 0)');
          r = Math.log10(a);
          break;
        case 'ln':
          if (a <= 0) throw new Error('ln nedefinit (argument ≤ 0)');
          r = Math.log(a);
          break;
        case 'exp':
          r = Math.exp(a);
          break;
      }
      if (!isFinite(r)) throw new Error('Rezultat infinit');
      if (isNaN(r))     throw new Error('Operatie invalida');
      stack.push(r);

    } else if (tok.type === 'postfix') {
      const a = stack.pop();
      if (a === undefined) throw new Error('Expresie incompleta');
      if (tok.v === '!')      stack.push(factorial(a));
      else if (tok.v === '%') stack.push(a / 100);
    }
  }

  if (stack.length !== 1) throw new Error('Expresie invalida');
  return stack[0];
}

function calculate(expr, angleMode) {
  if (typeof expr !== 'string' || !expr.trim()) {
    throw new Error('Expresie goala');
  }
  if (expr.length > MAX_EXPR_LEN) throw new Error('Expresie prea lunga');
  const tokens0 = tokenize(normalize(expr));
  if (tokens0.length === 0) throw new Error('Expresie goala');
  const tokens1 = insertImplicitMultiply(tokens0);
  const rpn = shuntingYard(tokens1);
  return evaluateRPN(rpn, angleMode);
}

function formatNumber(n) {
  if (n === 0) return '0';
  const rounded = Math.round(n * 1e10) / 1e10;
  if (Math.abs(rounded) >= 1e15) return rounded.toExponential(8);
  if (Math.abs(rounded) < 1e-9)  return rounded.toExponential(4);
  return String(rounded);
}

const CALC_BUTTONS = [

  { label: 'DEG', cls: 'mode',   action: 'mode' },
  { label: 'MC',  cls: 'mem',    action: 'mc' },
  { label: 'MR',  cls: 'mem',    action: 'mr' },
  { label: 'M+',  cls: 'mem',    action: 'mplus' },
  { label: 'C',   cls: 'util',   action: 'clear' },

  
  { label: 'sin', cls: 'fn',     action: 'insert', val: 'sin(' },
  { label: 'cos', cls: 'fn',     action: 'insert', val: 'cos(' },
  { label: 'tan', cls: 'fn',     action: 'insert', val: 'tan(' },
  { label: 'π',   cls: 'const',  action: 'insert', val: 'π' },
  { label: 'e',   cls: 'const',  action: 'insert', val: 'e' },

  
  { label: '√',   cls: 'fn',     action: 'insert', val: 'sqrt(' },
  { label: 'x²',  cls: 'fn',     action: 'insert', val: '^2' },
  { label: 'xʸ',  cls: 'op',     action: 'insert', val: '^' },
  { label: 'log', cls: 'fn',     action: 'insert', val: 'log(' },
  { label: 'ln',  cls: 'fn',     action: 'insert', val: 'ln(' },

  
  { label: '(',   cls: 'paren',  action: 'insert', val: '(' },
  { label: ')',   cls: 'paren',  action: 'insert', val: ')' },
  { label: 'n!',  cls: 'op',     action: 'insert', val: '!' },
  { label: '%',   cls: 'op',     action: 'insert', val: '%' },
  { label: '⌫',   cls: 'util',   action: 'backspace' },

  
  { label: '7',   cls: 'num',    action: 'insert', val: '7' },
  { label: '8',   cls: 'num',    action: 'insert', val: '8' },
  { label: '9',   cls: 'num',    action: 'insert', val: '9' },
  { label: '÷',   cls: 'op',     action: 'insert', val: '÷' },
  { label: '10ˣ', cls: 'fn',     action: 'insert', val: '10^' },

  
  { label: '4',   cls: 'num',    action: 'insert', val: '4' },
  { label: '5',   cls: 'num',    action: 'insert', val: '5' },
  { label: '6',   cls: 'num',    action: 'insert', val: '6' },
  { label: '×',   cls: 'op',     action: 'insert', val: '×' },
  { label: 'eˣ',  cls: 'fn',     action: 'insert', val: 'exp(' },

  
  { label: '1',   cls: 'num',    action: 'insert', val: '1' },
  { label: '2',   cls: 'num',    action: 'insert', val: '2' },
  { label: '3',   cls: 'num',    action: 'insert', val: '3' },
  { label: '−',   cls: 'op',     action: 'insert', val: '−' },
  { label: '+',   cls: 'op',     action: 'insert', val: '+' },

  
  { label: '0',   cls: 'num',    action: 'insert', val: '0',  span: 2 },
  { label: '.',   cls: 'num',    action: 'insert', val: '.' },
  { label: '=',   cls: 'equals', action: 'evaluate',          span: 2 },
];


function appendToExpression(s) {
  if (calcState.justEvaluated) {
    const continuesFromResult = /^[×÷+−*/^!%]/.test(s);
    if (!continuesFromResult) calcState.expression = '';
    calcState.justEvaluated = false;
  }
  if (calcState.hasError) {
    calcState.expression = '';
    calcState.hasError = false;
  }
  if (calcState.expression.length + s.length > MAX_EXPR_LEN) return;
  calcState.expression += s;
  updateDisplay();
}

function backspace() {
  if (calcState.hasError) {
    calcState.expression = '';
    calcState.hasError = false;
    updateDisplay();
    return;
  }
  if (calcState.justEvaluated) {
    calcState.justEvaluated = false;
    updateDisplay();
    return;
  }
  
  const expr = calcState.expression;
  for (const fn of FUNCTIONS) {
    const tag = fn + '(';
    if (expr.endsWith(tag)) {
      calcState.expression = expr.slice(0, -tag.length);
      updateDisplay();
      return;
    }
  }
  if (expr.endsWith('10^')) {
    calcState.expression = expr.slice(0, -3);
    updateDisplay();
    return;
  }
  calcState.expression = expr.slice(0, -1);
  updateDisplay();
}

function clearAll() {
  calcState.expression = '';
  calcState.justEvaluated = false;
  calcState.hasError = false;
  updateDisplay();
}

function toggleAngleMode() {
  calcState.angleMode = calcState.angleMode === 'deg' ? 'rad' : 'deg';
  storage.set(SK_MODE, calcState.angleMode);
  updateModeBadge();
}

function memClear() {
  calcState.memory = 0;
  calcState.hasMemory = false;
  storage.set(SK_MEMORY, 0);
  storage.set(SK_MEMFLAG, false);
  updateMemBadge();
  toast('Memorie stearsa');
}

function memRecall() {
  if (!calcState.hasMemory) {
    toast('Memorie goala');
    return;
  }
  appendToExpression(formatNumber(calcState.memory));
}

function memAdd() {
  let value;
  try {
    value = calculate(calcState.expression || '0', calcState.angleMode);
  } catch (e) {
    toast('Nu pot calcula expresia');
    return;
  }
  calcState.memory += value;
  calcState.hasMemory = true;
  storage.set(SK_MEMORY, calcState.memory);
  storage.set(SK_MEMFLAG, true);
  updateMemBadge();
  toast('M = ' + formatNumber(calcState.memory));
}

function evaluate() {
  const expr = calcState.expression;
  if (!expr || calcState.hasError) return;

  try {
    const result = calculate(expr, calcState.angleMode);
    const formatted = formatNumber(result);

    /* salveaza in istoric */
    calcState.history.unshift({ expr, result: formatted });
    if (calcState.history.length > MAX_HISTORY) {
      calcState.history.length = MAX_HISTORY;
    }
    storage.set(SK_HISTORY, calcState.history);
    renderHistory();

    calcState.expression = formatted;
    calcState.justEvaluated = true;
    calcState.hasError = false;
    updateDisplay();
  } catch (err) {
    calcState.expression = err.message || 'Eroare';
    calcState.hasError = true;
    updateDisplay();
  }
}

function handleKeyboard(e) {
  const focusSection = document.getElementById('section-focus');
  if (!focusSection || !focusSection.classList.contains('active')) return;

  const ae = document.activeElement;
  if (ae && (
    ae.tagName === 'INPUT' ||
    ae.tagName === 'TEXTAREA' ||
    ae.tagName === 'SELECT' ||
    ae.isContentEditable
  )) return;

  if ((e.key === 'Enter' || e.key === ' ') && ae && ae.tagName === 'BUTTON') {
    return;
  }

  const key = e.key;
  let handled = true;

  if      (/^[0-9]$/.test(key))           appendToExpression(key);
  else if (key === '.')                   appendToExpression('.');
  else if (key === '+')                   appendToExpression('+');
  else if (key === '-')                   appendToExpression('−');
  else if (key === '*')                   appendToExpression('×');
  else if (key === '/')                   appendToExpression('÷');
  else if (key === '(' || key === ')')    appendToExpression(key);
  else if (key === '^')                   appendToExpression('^');
  else if (key === '!')                   appendToExpression('!');
  else if (key === '%')                   appendToExpression('%');
  else if (key === 'Enter' || key === '=') evaluate();
  else if (key === 'Backspace')           backspace();
  else if (key === 'Escape')              clearAll();
  else handled = false;

  if (handled) e.preventDefault();
}

function updateDisplay() {
  if (!calcDisplay) return;
 
  calcDisplay.textContent = calcState.expression || '0';
  calcDisplay.classList.toggle('calc__display--error', calcState.hasError);
}

function updateModeBadge() {
  if (calcModeBadge) {
    calcModeBadge.textContent = calcState.angleMode.toUpperCase();
  }
  const modeBtn = document.querySelector('.calc__key--mode');
  if (modeBtn) modeBtn.textContent = calcState.angleMode.toUpperCase();
}

function updateMemBadge() {
  if (!calcMemBadge) return;
  calcMemBadge.style.visibility = calcState.hasMemory ? 'visible' : 'hidden';
}

function renderHistory() {
  if (!calcHistoryEl) return;
  calcHistoryEl.innerHTML = '';
  const slice = calcState.history.slice(0, MAX_HISTORY_DISPLAY);
  for (const item of slice) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'calc__history-item';
    row.title = 'Click: incarca expresia';
    row.setAttribute('aria-label', `${item.expr} egal ${item.result}`);

    const exprEl = document.createElement('span');
    exprEl.className = 'calc__history-expr';
    exprEl.textContent = item.expr;
    row.appendChild(exprEl);

    const resEl = document.createElement('span');
    resEl.className = 'calc__history-res';
    resEl.textContent = '= ' + item.result;
    row.appendChild(resEl);

    row.addEventListener('click', () => {
      calcState.expression = item.expr;
      calcState.justEvaluated = false;
      calcState.hasError = false;
      updateDisplay();
    });

    calcHistoryEl.appendChild(row);
  }
}

function toast(msg) {
  document.dispatchEvent(new CustomEvent('toast', {
    detail: { msg, type: 'info' }
  }));
}

function renderButtons() {
  const grid = document.getElementById('calc-keys');
  if (!grid) return;
  grid.innerHTML = '';

  for (const btn of CALC_BUTTONS) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'calc__key calc__key--' + btn.cls;
    if (btn.action === 'mode')     el.classList.add('calc__key--mode');
    if (btn.action === 'evaluate') el.classList.add('calc__key--equals');
    if (btn.span === 2)            el.classList.add('calc__key--span2');
    el.textContent = btn.label;
    el.setAttribute('aria-label', `Tasta ${btn.label}`);

    el.addEventListener('click', (ev) => {
      switch (btn.action) {
        case 'insert':    appendToExpression(btn.val); break;
        case 'evaluate':  evaluate(); break;
        case 'backspace': backspace(); break;
        case 'clear':     clearAll(); break;
        case 'mode':      toggleAngleMode(); break;
        case 'mc':        memClear(); break;
        case 'mr':        memRecall(); break;
        case 'mplus':     memAdd(); break;
      }
      if (ev.detail > 0) el.blur();
    });

    grid.appendChild(el);
  }
}

function loadPersistedState() {
  const mode = storage.get(SK_MODE, 'deg');
  if (mode === 'rad' || mode === 'deg') calcState.angleMode = mode;

  const mem = storage.get(SK_MEMORY, 0);
  if (typeof mem === 'number' && isFinite(mem)) calcState.memory = mem;
  calcState.hasMemory = !!storage.get(SK_MEMFLAG, false);

  const hist = storage.get(SK_HISTORY, []);
  if (Array.isArray(hist)) {
    calcState.history = hist
      .filter((h) => h && typeof h.expr === 'string'
                       && typeof h.result === 'string'
                       && h.expr.length <= MAX_EXPR_LEN
                       && h.result.length <= 50)
      .slice(0, MAX_HISTORY);
  }
}

function ensureCalcStructure() {
  const display = document.getElementById('calc-display');
  if (!display || !display.parentNode) return;
  if (document.getElementById('calc-history')) return;

  
  const meta = document.createElement('div');
  meta.className = 'calc__meta';

  const modeBadge = document.createElement('span');
  modeBadge.className = 'calc__badge calc__badge--mode';
  modeBadge.id = 'calc-mode-badge';
  modeBadge.textContent = 'DEG';
  meta.appendChild(modeBadge);

  const memBadge = document.createElement('span');
  memBadge.className = 'calc__badge calc__badge--mem';
  memBadge.id = 'calc-mem-badge';
  memBadge.textContent = 'M';
  memBadge.style.visibility = 'hidden';
  meta.appendChild(memBadge);

  display.parentNode.insertBefore(meta, display);

  /* istoric */
  const history = document.createElement('div');
  history.className = 'calc__history';
  history.id = 'calc-history';
  history.setAttribute('role', 'list');
  history.setAttribute('aria-label', 'Istoric calcule');
  display.parentNode.insertBefore(history, display);
}

export function initCalculator() {
  loadPersistedState();
  ensureCalcStructure();

  calcDisplay   = document.getElementById('calc-display');
  calcHistoryEl = document.getElementById('calc-history');
  calcModeBadge = document.getElementById('calc-mode-badge');
  calcMemBadge  = document.getElementById('calc-mem-badge');

  if (!calcDisplay) return;

  renderButtons();
  updateDisplay();
  updateModeBadge();
  updateMemBadge();
  renderHistory();

  document.addEventListener('keydown', handleKeyboard);
}


/*citate*/

const QUOTES = [
  { text: 'Cunoasterea este putere — dar aplicarea ei e adevarata libertate.', author: 'proverb' },
  { text: 'Nu trebuie sa fii grozav ca sa incepi, dar trebuie sa incepi ca sa devii grozav.', author: 'Zig Ziglar' },
  { text: 'Caderea de sapte ori, ridicarea de opt — Nana korobi ya oki.', author: 'proverb japonez' },
  { text: 'Cel mai bun moment sa plantezi un copac a fost acum 20 de ani. Al doilea cel mai bun moment e acum.', author: 'proverb chinez' },
  { text: 'Nu conteaza cat de incet mergi, atata timp cat nu te opresti.', author: 'Confucius' },
  { text: 'Disciplina e podul intre obiective si realizare.', author: 'Jim Rohn' },
  { text: 'Daca nu ai timp sa o faci bine, cand vei avea timp sa o repari?', author: 'John Wooden' },
  { text: 'Maestria nu vine din a face mai mult — vine din a face mai bine, mai atent.', author: 'inteleptul Zen' },
  { text: 'Ceea ce nu te ucide te face mai puternic — sau cel putin mai obosit.', author: 'student la sesiune' },
  { text: 'Studiul fara dorinta strica memoria, si nu retine nimic din ce primeste.', author: 'Leonardo da Vinci' },
  { text: 'Inteligenta nu e privilegiul putinora, ci a celor care exerseaza zilnic.', author: 'anonim' },
  { text: 'Mintea care se deschide unei idei noi nu se mai intoarce niciodata la dimensiunea originala.', author: 'Albert Einstein' },
  { text: 'Cel mai mare dusman al cunoasterii nu e ignoranta, e iluzia cunoasterii.', author: 'Stephen Hawking' },
  { text: 'Studiaza ca si cum ai trai pentru totdeauna. Traieste ca si cum ai muri maine.', author: 'Mahatma Gandhi' },
  { text: 'Un pas mic in fiecare zi devine o calatorie de o mie de mile.', author: 'Lao Tzu, parafrazat' }
];

let lastQuoteIndex = -1;

function showRandomQuote() {
  const contentEl = document.getElementById('quote-content');
  const authorEl = document.getElementById('quote-author');
  if (!contentEl || !authorEl) return;

  let idx;
  do {
    idx = Math.floor(Math.random() * QUOTES.length);
  } while (idx === lastQuoteIndex && QUOTES.length > 1);
  lastQuoteIndex = idx;

  const q = QUOTES[idx];
  contentEl.style.opacity = '0';
  authorEl.style.opacity = '0';
  setTimeout(() => {
    contentEl.textContent = q.text;
    authorEl.textContent = '— ' + q.author;
    contentEl.style.opacity = '1';
    authorEl.style.opacity = '1';
  }, 200);
}

export function initQuotes() {
  const btn = document.getElementById('btn-new-quote');
  showRandomQuote();
  if (btn) btn.addEventListener('click', showRandomQuote);
}


/* player audio*/

const TRACKS = {
  lofi:    { label: 'Lo-fi',  emoji: '🎵', desc: 'Beat-uri linistite pentru concentrare' },
  rain:    { label: 'Ploaie', emoji: '🌧️', desc: 'Sunet de ploaie blanda' },
  silence: { label: 'Liniste', emoji: '🤫', desc: 'Niciun zgomot — doar tu si gandurile tale' }
};

let activeTrack = null;

function setActiveTrack(trackId) {
  if (activeTrack === trackId) activeTrack = null;
  else activeTrack = trackId;

  const buttons = document.querySelectorAll('.audio-player__track');
  buttons.forEach((btn) => {
    if (btn.dataset.track === activeTrack) {
      btn.classList.add('audio-player__track--active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('audio-player__track--active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  const status = document.getElementById('audio-status');
  if (status) {
    if (activeTrack && TRACKS[activeTrack]) {
      const t = TRACKS[activeTrack];
      status.textContent = `${t.emoji} ${t.label} — ${t.desc} (simulat)`;
    } else {
      status.textContent = 'Nicio sursa selectata';
    }
  }
}

export function initAudio() {
  const buttons = document.querySelectorAll('.audio-player__track');
  buttons.forEach((btn) => {
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const trackId = btn.dataset.track;
      if (trackId) setActiveTrack(trackId);
    });
  });
}

export function init() {
  initCalculator();
  initQuotes();
  initAudio();
}
