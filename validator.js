/*
 VALIDATOR.JS - Programare defensiva: validare si sanitizare

 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return '';

  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
  };

  return str.replace(/[&<>"'`/]/g, (char) => HTML_ENTITIES[char]);
}


export function validateString(input, options = {}) {
  const {
    min = 1,
    max = 200,
    allowEmpty = false,
    fieldName = 'Camp',
  } = options;

  if (typeof input !== 'string') {
    if (allowEmpty && (input === null || input === undefined)) {
      return { valid: true, value: '' };
    }
    return { valid: false, error: `${fieldName} trebuie sa fie text.` };
  }

  const trimmed = input.trim();

  if (!allowEmpty && trimmed.length < min) {
    return { valid: false, error: `${fieldName} trebuie sa aiba minim ${min} caractere.` };
  }

  if (trimmed.length > max) {
    return { valid: false, error: `${fieldName} este prea lung (max ${max}).` };
  }

  
  return { valid: true, value: escapeHTML(trimmed) };
}

export function validateNumber(input, options = {}) {
  const {
    min = -Infinity,
    max = Infinity,
    integer = false,
    fieldName = 'Numar',
  } = options;

  // convertim la numar - parseFloat ignora caracterele non-numerice de la sfarsit
  const num = parseFloat(input);

  if (Number.isNaN(num)) {
    return { valid: false, error: `${fieldName} trebuie sa fie un numar valid.` };
  }

  if (integer && !Number.isInteger(num)) {
    return { valid: false, error: `${fieldName} trebuie sa fie un numar intreg.` };
  }

  if (num < min || num > max) {
    return { valid: false, error: `${fieldName} trebuie sa fie intre ${min} si ${max}.` };
  }

  return { valid: true, value: num };
}

export function validateDate(input, options = {}) {
  const { allowPast = true, fieldName = 'Data' } = options;

  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { valid: false, error: `${fieldName} trebuie in format YYYY-MM-DD.` };
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: `${fieldName} nu este o data valida.` };
  }

  if (!allowPast) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      return { valid: false, error: `${fieldName} nu poate fi in trecut.` };
    }
  }

  return { valid: true, value: input };
}

/* valideaza o nota scolara romaneasca (1-10, cu o zecimala)..
 */
export function validateGrade(input) {
  const result = validateNumber(input, {
    min: 1,
    max: 10,
    fieldName: 'Nota',
  });
  if (!result.valid) return result;

  // rotunjim la 2 zecimale
  return { valid: true, value: Math.round(result.value * 100) / 100 };
}


export function hasShape(obj, requiredKeys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return requiredKeys.every((key) => key in obj);
}


export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
