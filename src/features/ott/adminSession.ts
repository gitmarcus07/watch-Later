import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_KEY = 'watch-later.ott-admin.pin.v1';

/**
 * Device-local admin PIN. This is UX-level gating only (keeps casual users
 * out of the form) — it is NOT the security boundary. Real enforcement is:
 * Supabase RLS (client keys can never write `ott_releases`) plus the
 * operator's service-role key, which lives in memory for the session and is
 * never persisted anywhere.
 */
export async function hasAdminPin(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PIN_KEY)) !== null;
  } catch {
    return false;
  }
}

export async function setAdminPin(pin: string): Promise<void> {
  await AsyncStorage.setItem(PIN_KEY, pin);
}

export async function checkAdminPin(pin: string): Promise<boolean> {
  try {
    const saved = await AsyncStorage.getItem(PIN_KEY);
    return saved !== null && saved === pin;
  } catch {
    return false;
  }
}

export async function clearAdminPin(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PIN_KEY);
  } catch {
    // Non-fatal; the gate simply stays as-is.
  }
}

let sessionServiceKey: string | null = null;

/** Service-role key for this session only. Never persisted — restart clears it. */
export function setSessionServiceKey(key: string): void {
  sessionServiceKey = key.trim() || null;
}

export function getSessionServiceKey(): string | null {
  return sessionServiceKey;
}

export function clearSessionServiceKey(): void {
  sessionServiceKey = null;
}
