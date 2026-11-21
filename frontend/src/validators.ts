// Client-side validation: instant feedback before the request. The server re-validates everything.
export const isEmail = (v: string) => v.length <= 100 && /^[a-z0-9]+([._+-][a-z0-9]+)*@[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.[a-z]{2,}$/i.test(v.trim());
export const normPhone = (v: any) => String(v || '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
export const isPhone = (v: any) => { const n = normPhone(v); return /^[6-9]\d{9}$/.test(n) && !/^(\d)\1{9}$/.test(n) && !/(\d)\1{6}/.test(n); };

/**
 * rules: { field: [ (value, all) => 'message' | null, ... ] }
 * returns { field: 'message' } for the first failing rule per field.
 */
export function validate(values: Record<string, any>, rules: Record<string, Array<(v: any, all: any) => string | null | undefined>>) {
  const errors: Record<string, string> = {};
  for (const [field, checks] of Object.entries(rules)) {
    for (const check of checks) {
      const msg = check(values[field], values);
      if (msg) { errors[field] = msg; break; }
    }
  }
  return errors;
}

export const required = (label: string) => (v: any) => (v === undefined || v === null || String(v).trim() === '' ? `${label} is required` : null);
export const minLen = (n: number, label: string) => (v: any) => (v && String(v).trim().length < n ? `${label} must be at least ${n} characters` : null);
export const email = (v: any) => (v && !isEmail(v) ? 'Please enter a valid email address (e.g. name@example.com)' : null);
export const phone = (v: any) => (v && !isPhone(v) ? 'Enter a valid 10-digit Indian mobile number' : null);
export const range = (min: number, max: number, label: string) => (v: any) => (v !== '' && v != null && (Number(v) < min || Number(v) > max || Number.isNaN(Number(v))) ? `${label} must be between ${min} and ${max}` : null);
export const positive = (label: string) => (v: any) => (v !== '' && v != null && !(Number(v) > 0) ? `${label} must be greater than 0` : null);

// ---- text format rules (the server applies the same ones) ----
const tidy = (v: any) => String(v ?? '').trim().replace(/\s+/g, ' ');
/** Person name: letters, spaces and . ' - only, starts with a letter, 2 to 60 characters. */
export const personName = (label = 'Name') => (v: any) => {
  const t = tidy(v);
  if (!t) return null;
  if (t.length < 2) return `${label} must be at least 2 characters`;
  if (t.length > 60) return `${label} must be at most 60 characters`;
  return /^\p{L}[\p{L} .'-]*$/u.test(t) ? null : `${label} can contain only letters, spaces and . ' -`;
};
/** City: optional, letters, spaces and . ' - */
export const cityName = (v: any) => {
  const t = tidy(v);
  if (!t) return null;
  if (t.length < 2 || t.length > 60) return 'City must be 2 to 60 characters';
  return /^\p{L}[\p{L} .'-]*$/u.test(t) ? null : "City can contain only letters, spaces and . ' -";
};
/** Address: 8 to 200 characters, letters/digits and , . - / # ( ) & ' with a real word in it. */
export const addressText = (label = 'Address') => (v: any) => {
  const t = tidy(v);
  if (!t) return null;
  if (t.length < 8) return `${label} must be at least 8 characters`;
  if (t.length > 200) return `${label} must be at most 200 characters`;
  if (!/^[\p{L}\p{N} ,./#()&'-]+$/u.test(t)) return `${label} has characters that are not allowed. Use letters, numbers and , . - / # ( )`;
  return /\p{L}{3,}/u.test(t) ? null : `${label} must include a street, area or building name`;
};
/** Free text: no < or > and a length limit. */
export const safeText = (label: string, max = 500) => (v: any) =>
  /[<>]/.test(String(v ?? '')) ? `${label} cannot contain < or >` : String(v ?? '').length > max ? `${label} must be at most ${max} characters` : null;
/** Company name: letters and digits plus . , & ' - ( ) */
export const businessName = (label = 'Name') => (v: any) => {
  const t = tidy(v);
  if (!t) return null;
  if (t.length < 2 || t.length > 120) return `${label} must be 2 to 120 characters`;
  return /^[\p{L}\p{N}][\p{L}\p{N} .,&'()-]*$/u.test(t) ? null : `${label} has characters that are not allowed`;
};
