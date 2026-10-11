import * as Localization from 'expo-localization';

/** Best-effort ISO region for watch-provider lookup; falls back to US. */
export function deviceRegion(): string {
  try {
    const locales = Localization.getLocales();
    const region = locales[0]?.regionCode;
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  } catch { /* Fall through to the default region. */ }
  return 'US';
}
