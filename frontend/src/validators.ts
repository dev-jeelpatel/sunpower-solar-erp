// Client-side validation: instant feedback before the request. The server re-validates everything.
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const normPhone = (v: any) => String(v || '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
export const isPhone = (v: any) => /^[6-9]\d{9}$/.test(normPhone(v));

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
