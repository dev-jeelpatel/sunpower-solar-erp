import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import { HttpError, unprocessable } from '../../lib/errors';

/**
 * One-time codes for the mobile-number warranty check.
 * Codes live in memory (5 minutes, 5 tries), which is right for a single API instance; a multi-instance
 * deployment would keep them in Redis or a table. Only a hash of the code is stored.
 */
const TTL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;
const MAX_TRIES = 5;

interface Entry { hash: string; expires: number; sentAt: number; tries: number }
const codes = new Map<string, Entry>();

const hash = (phone: string, code: string) => createHash('sha256').update(`${phone}:${code}:${env.jwtSecret}`).digest('hex');

function sweep() {
  const now = Date.now();
  for (const [k, v] of codes) if (v.expires < now) codes.delete(k);
}

/** Hand the code to an SMS provider. Plug a real provider in here (MSG91, Twilio...). */
async function sendSms(phone: string, text: string) {
  if (env.otpDemo) {
    console.log(`[otp demo] SMS to ${phone}: ${text}`);
    return;
  }
  throw new HttpError(503, 'Mobile verification is not available right now. Please use the serial number on your equipment instead.');
}

/** Creates and "sends" a code. Returns it only in demo mode. */
export async function issueCode(phone: string): Promise<{ demoCode?: string }> {
  sweep();
  const prev = codes.get(phone);
  if (prev && Date.now() - prev.sentAt < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - prev.sentAt)) / 1000);
    throw unprocessable(`Please wait ${wait} seconds before asking for another code`);
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await sendSms(phone, `Your SunPower verification code is ${code}. It is valid for 5 minutes. Do not share it.`);
  codes.set(phone, { hash: hash(phone, code), expires: Date.now() + TTL_MS, sentAt: Date.now(), tries: 0 });
  return env.otpDemo ? { demoCode: code } : {};
}

/** Checks a code. A correct code is used up; too many wrong tries burn it. */
export function checkCode(phone: string, code: string): boolean {
  sweep();
  const e = codes.get(phone);
  if (!e) return false;
  e.tries += 1;
  if (e.tries > MAX_TRIES) { codes.delete(phone); return false; }
  const a = Buffer.from(e.hash);
  const b = Buffer.from(hash(phone, code));
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) codes.delete(phone);
  return ok;
}

export const OTP_TTL_SECONDS = TTL_MS / 1000;
