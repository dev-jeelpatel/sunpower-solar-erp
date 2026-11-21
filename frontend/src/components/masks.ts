/**
 * Input masks: what a person is allowed to type in a box. Anything that cannot be valid is
 * stopped as it is typed, and a short message says why ("A mobile number has exactly 10 digits").
 * The server checks everything again, so these only make the form easier to fill in.
 */
export type MaskName = 'phone' | 'name' | 'city' | 'email' | 'address' | 'digits' | 'decimal' | 'serial' | 'sku' | 'vehicle' | 'company' | 'text';
export interface Masked { value: string; notice?: string }

const letters = /[^\p{L} .'-]/gu;
const clip = (v: string, n: number, what: string): Masked => (v.length > n ? { value: v.slice(0, n), notice: `At most ${n} ${what}` } : { value: v });

export function applyMask(mask: MaskName, raw: string, max?: number): Masked {
  switch (mask) {
    case 'phone': {
      let d = raw.replace(/\D/g, '');
      // pasted with a country code or a leading zero: +91 98250 10001, 098250 10001
      if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
      else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
      const odd = /[^\d\s+-]/.test(raw);
      if (d.length > 10) return { value: d.slice(0, 10), notice: 'A mobile number has exactly 10 digits' };
      if (d && !/^[6-9]/.test(d)) return { value: d.replace(/^[^6-9]+/, ''), notice: 'A mobile number starts with 6, 7, 8 or 9' };
      return odd ? { value: d, notice: 'Only digits are allowed in a mobile number' } : { value: d };
    }
    case 'name':
    case 'city': {
      const stripped = raw.replace(letters, '');
      const cleaned = stripped.replace(/^[^\p{L}]+/u, '');
      if (cleaned.length > 60) return { value: cleaned.slice(0, 60), notice: 'At most 60 characters' };
      if (stripped !== raw) return { value: cleaned, notice: /\d/.test(raw) ? 'Digits are not allowed here' : "Only letters, spaces and . ' - are allowed here" };
      if (cleaned !== stripped) return { value: cleaned, notice: 'It must start with a letter' };
      return { value: cleaned };
    }
    case 'email': {
      let v = raw.replace(/[^A-Za-z0-9._%+@-]/g, '');
      let notice = v !== raw ? 'An email uses letters, numbers and . _ - + @ only (no spaces)' : undefined;
      const at = v.indexOf('@');
      if (at !== -1 && v.indexOf('@', at + 1) !== -1) { v = v.slice(0, v.indexOf('@', at + 1)) + v.slice(v.indexOf('@', at + 1) + 1).replace(/@/g, ''); notice = 'An email has only one @'; }
      const r = clip(v, 100, 'characters');
      return { value: r.value, notice: notice || r.notice };
    }
    case 'address': {
      const cleaned = raw.replace(/[^\p{L}\p{N} ,./#()&'-]/gu, '');
      const r = clip(cleaned, 200, 'characters');
      return r.notice ? r : cleaned !== raw ? { value: cleaned, notice: 'Use letters, numbers and , . - / # ( ) in an address' } : r;
    }
    case 'digits': {
      const cleaned = raw.replace(/\D/g, '');
      const r = max ? clip(cleaned, max, 'digits') : { value: cleaned };
      return r.notice ? r : cleaned !== raw ? { value: cleaned, notice: 'Only whole numbers are allowed here' } : r;
    }
    case 'decimal': {
      let v = raw.replace(/[^\d.]/g, '');
      const dot = v.indexOf('.');
      if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
      const [whole, frac] = v.split('.');
      const out = frac === undefined ? whole : `${whole}.${frac.slice(0, 2)}`;
      return out !== raw ? { value: out, notice: /\./.test(raw) && frac !== undefined && frac.length > 2 ? 'At most two decimal places' : 'Numbers only, with up to two decimals' } : { value: out };
    }
    case 'serial':
    case 'sku': {
      const up = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const r = clip(up, mask === 'sku' ? 30 : 40, 'characters');
      return r.notice ? r : up !== raw.toUpperCase() ? { value: up, notice: 'Use letters, numbers and dashes only' } : r;
    }
    case 'vehicle': {
      const up = raw.toUpperCase().replace(/[^A-Z0-9 -]/g, '');
      const r = clip(up, 13, 'characters');
      return r.notice ? r : up !== raw.toUpperCase() ? { value: up, notice: 'Use letters and numbers only, e.g. GJ05AB1234' } : r;
    }
    case 'company': {
      const cleaned = raw.replace(/[^\p{L}\p{N} .,&'()-]/gu, '');
      const r = clip(cleaned, 120, 'characters');
      return r.notice ? r : cleaned !== raw ? { value: cleaned, notice: "Use letters, numbers and . , & ' ( ) - in a company name" } : r;
    }
    case 'text': {
      const cleaned = raw.replace(/[<>]/g, '');
      return cleaned !== raw ? { value: cleaned, notice: '< and > are not allowed' } : { value: cleaned };
    }
  }
}
