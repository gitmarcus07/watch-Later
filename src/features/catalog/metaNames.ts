const LANGUAGES: Record<string, string> = {
  en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', ar: 'Arabic', tr: 'Turkish', nl: 'Dutch', sv: 'Swedish',
  no: 'Norwegian', da: 'Danish', fi: 'Finnish', pl: 'Polish', cs: 'Czech',
  el: 'Greek', he: 'Hebrew', hu: 'Hungarian', ro: 'Romanian', th: 'Thai',
  vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', ta: 'Tamil', te: 'Telugu',
  ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', pa: 'Punjabi',
  gu: 'Gujarati', ur: 'Urdu', fa: 'Persian', uk: 'Ukrainian',
};

const COUNTRIES: Record<string, string> = {
  US: 'USA', IN: 'India', GB: 'UK', CA: 'Canada', AU: 'Australia',
  FR: 'France', DE: 'Germany', ES: 'Spain', IT: 'Italy', JP: 'Japan',
  KR: 'South Korea', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan',
  BR: 'Brazil', MX: 'Mexico', RU: 'Russia', ZA: 'South Africa', NG: 'Nigeria',
  EG: 'Egypt', TR: 'Turkey', NL: 'Netherlands', SE: 'Sweden', NO: 'Norway',
  DK: 'Denmark', FI: 'Finland', PL: 'Poland', CZ: 'Czechia', GR: 'Greece',
  IL: 'Israel', HU: 'Hungary', RO: 'Romania', TH: 'Thailand', VN: 'Vietnam',
  ID: 'Indonesia', MY: 'Malaysia', PH: 'Philippines', SG: 'Singapore',
  NZ: 'New Zealand', IE: 'Ireland', CH: 'Switzerland', AT: 'Austria',
  BE: 'Belgium', AR: 'Argentina', CO: 'Colombia', CL: 'Chile', UA: 'Ukraine',
};

export function languageName(code?: string): string | undefined {
  if (!code) return undefined;
  return LANGUAGES[code.toLowerCase()] ?? code.toUpperCase();
}

export function countryName(code?: string): string | undefined {
  if (!code) return undefined;
  return COUNTRIES[code.toUpperCase()] ?? code.toUpperCase();
}
