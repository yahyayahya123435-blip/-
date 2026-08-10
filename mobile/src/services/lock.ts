/**
 * PIN lock for the field app.
 *
 * The phone carries names, national IDs and household details of vulnerable
 * families, so the app does not open straight into the data. This is a local
 * lock, not an account system: there is no server to authenticate against and
 * no password to recover.
 *
 * The PIN is stored as a SHA-256 hash of (salt + PIN), never in clear text.
 * A four-digit PIN is not strong against someone who has both the unlocked
 * phone and unlimited attempts — so attempts are rate-limited with a growing
 * delay, and the real protection remains the device's own lock screen and
 * Android's per-app private storage.
 */
import * as Crypto from 'expo-crypto';
import { getMeta, setMeta, newId } from '../db/client';

const SALT_KEY = 'pinSalt';
const HASH_KEY = 'pinHash';
const OPERATOR_KEY = 'operatorName';
const FAILED_KEY = 'pinFailedAttempts';

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function isPinConfigured(): Promise<boolean> {
  return (await getMeta(HASH_KEY)) !== null;
}

export async function getOperatorName(): Promise<string | null> {
  return getMeta(OPERATOR_KEY);
}

export async function configurePin(pin: string, operatorName: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('الرمز يجب أن يتكون من 4 إلى 8 أرقام');
  }
  if (operatorName.trim().length < 2) {
    throw new Error('يرجى إدخال اسم الموظف');
  }
  const salt = newId();
  await setMeta(SALT_KEY, salt);
  await setMeta(HASH_KEY, await hashPin(pin, salt));
  await setMeta(OPERATOR_KEY, operatorName.trim());
  await setMeta(FAILED_KEY, '0');
}

export interface UnlockResult {
  ok: boolean;
  /** Milliseconds the caller should refuse to retry for. */
  lockoutMs: number;
}

export async function verifyPin(pin: string): Promise<UnlockResult> {
  const salt = await getMeta(SALT_KEY);
  const expected = await getMeta(HASH_KEY);
  if (!salt || !expected) return { ok: false, lockoutMs: 0 };

  const failed = Number((await getMeta(FAILED_KEY)) ?? '0');
  const candidate = await hashPin(pin, salt);

  if (candidate !== expected) {
    const next = failed + 1;
    await setMeta(FAILED_KEY, String(next));
    // 0s, 0s, 0s, then 5s, 10s, 20s… capped at two minutes.
    const lockoutMs = next <= 3 ? 0 : Math.min(2 ** (next - 3) * 2500, 120_000);
    return { ok: false, lockoutMs };
  }

  await setMeta(FAILED_KEY, '0');
  return { ok: true, lockoutMs: 0 };
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  const check = await verifyPin(currentPin);
  if (!check.ok) throw new Error('الرمز الحالي غير صحيح');
  const operator = (await getOperatorName()) ?? 'موظف ميداني';
  await configurePin(newPin, operator);
}
