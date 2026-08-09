/**
 * Surfshark location catalogue.
 *
 * `code` is the ISO 3166-1 alpha-2 code used everywhere else in this project
 * (payloads, the allocation ledger, the dashboard). `label` is the text the
 * driver looks for inside the Surfshark extension's location list, so it must
 * match what the extension actually renders. Surfshark changes its location
 * list over time; edit this file when a location is added or retired.
 */
export const COUNTRY_CATALOGUE = [
  { code: "AL", name: "Albania", label: "Albania", flag: "🇦🇱" },
  { code: "AR", name: "Argentina", label: "Argentina", flag: "🇦🇷" },
  { code: "AU", name: "Australia", label: "Australia", flag: "🇦🇺" },
  { code: "AT", name: "Austria", label: "Austria", flag: "🇦🇹" },
  { code: "AZ", name: "Azerbaijan", label: "Azerbaijan", flag: "🇦🇿" },
  { code: "BE", name: "Belgium", label: "Belgium", flag: "🇧🇪" },
  { code: "BA", name: "Bosnia and Herzegovina", label: "Bosnia and Herzegovina", flag: "🇧🇦" },
  { code: "BR", name: "Brazil", label: "Brazil", flag: "🇧🇷" },
  { code: "BG", name: "Bulgaria", label: "Bulgaria", flag: "🇧🇬" },
  { code: "CA", name: "Canada", label: "Canada", flag: "🇨🇦" },
  { code: "CL", name: "Chile", label: "Chile", flag: "🇨🇱" },
  { code: "CO", name: "Colombia", label: "Colombia", flag: "🇨🇴" },
  { code: "CR", name: "Costa Rica", label: "Costa Rica", flag: "🇨🇷" },
  { code: "HR", name: "Croatia", label: "Croatia", flag: "🇭🇷" },
  { code: "CY", name: "Cyprus", label: "Cyprus", flag: "🇨🇾" },
  { code: "CZ", name: "Czech Republic", label: "Czech Republic", flag: "🇨🇿" },
  { code: "DK", name: "Denmark", label: "Denmark", flag: "🇩🇰" },
  { code: "EE", name: "Estonia", label: "Estonia", flag: "🇪🇪" },
  { code: "FI", name: "Finland", label: "Finland", flag: "🇫🇮" },
  { code: "FR", name: "France", label: "France", flag: "🇫🇷" },
  { code: "GE", name: "Georgia", label: "Georgia", flag: "🇬🇪" },
  { code: "DE", name: "Germany", label: "Germany", flag: "🇩🇪" },
  { code: "GR", name: "Greece", label: "Greece", flag: "🇬🇷" },
  { code: "HK", name: "Hong Kong", label: "Hong Kong", flag: "🇭🇰" },
  { code: "HU", name: "Hungary", label: "Hungary", flag: "🇭🇺" },
  { code: "IS", name: "Iceland", label: "Iceland", flag: "🇮🇸" },
  { code: "IN", name: "India", label: "India", flag: "🇮🇳" },
  { code: "ID", name: "Indonesia", label: "Indonesia", flag: "🇮🇩" },
  { code: "IE", name: "Ireland", label: "Ireland", flag: "🇮🇪" },
  { code: "IL", name: "Israel", label: "Israel", flag: "🇮🇱" },
  { code: "IT", name: "Italy", label: "Italy", flag: "🇮🇹" },
  { code: "JP", name: "Japan", label: "Japan", flag: "🇯🇵" },
  { code: "KZ", name: "Kazakhstan", label: "Kazakhstan", flag: "🇰🇿" },
  { code: "LV", name: "Latvia", label: "Latvia", flag: "🇱🇻" },
  { code: "LT", name: "Lithuania", label: "Lithuania", flag: "🇱🇹" },
  { code: "LU", name: "Luxembourg", label: "Luxembourg", flag: "🇱🇺" },
  { code: "MY", name: "Malaysia", label: "Malaysia", flag: "🇲🇾" },
  { code: "MX", name: "Mexico", label: "Mexico", flag: "🇲🇽" },
  { code: "MD", name: "Moldova", label: "Moldova", flag: "🇲🇩" },
  { code: "NL", name: "Netherlands", label: "Netherlands", flag: "🇳🇱" },
  { code: "NZ", name: "New Zealand", label: "New Zealand", flag: "🇳🇿" },
  { code: "NG", name: "Nigeria", label: "Nigeria", flag: "🇳🇬" },
  { code: "MK", name: "North Macedonia", label: "North Macedonia", flag: "🇲🇰" },
  { code: "NO", name: "Norway", label: "Norway", flag: "🇳🇴" },
  { code: "PY", name: "Paraguay", label: "Paraguay", flag: "🇵🇾" },
  { code: "PH", name: "Philippines", label: "Philippines", flag: "🇵🇭" },
  { code: "PL", name: "Poland", label: "Poland", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", label: "Portugal", flag: "🇵🇹" },
  { code: "RO", name: "Romania", label: "Romania", flag: "🇷🇴" },
  { code: "RS", name: "Serbia", label: "Serbia", flag: "🇷🇸" },
  { code: "SG", name: "Singapore", label: "Singapore", flag: "🇸🇬" },
  { code: "SK", name: "Slovakia", label: "Slovakia", flag: "🇸🇰" },
  { code: "SI", name: "Slovenia", label: "Slovenia", flag: "🇸🇮" },
  { code: "ZA", name: "South Africa", label: "South Africa", flag: "🇿🇦" },
  { code: "KR", name: "South Korea", label: "South Korea", flag: "🇰🇷" },
  { code: "ES", name: "Spain", label: "Spain", flag: "🇪🇸" },
  { code: "SE", name: "Sweden", label: "Sweden", flag: "🇸🇪" },
  { code: "CH", name: "Switzerland", label: "Switzerland", flag: "🇨🇭" },
  { code: "TW", name: "Taiwan", label: "Taiwan", flag: "🇹🇼" },
  { code: "TH", name: "Thailand", label: "Thailand", flag: "🇹🇭" },
  { code: "TR", name: "Turkey", label: "Turkey", flag: "🇹🇷" },
  { code: "UA", name: "Ukraine", label: "Ukraine", flag: "🇺🇦" },
  { code: "AE", name: "United Arab Emirates", label: "United Arab Emirates", flag: "🇦🇪" },
  { code: "GB", name: "United Kingdom", label: "United Kingdom", flag: "🇬🇧" },
  { code: "US", name: "United States", label: "United States", flag: "🇺🇸" },
  { code: "VN", name: "Vietnam", label: "Vietnam", flag: "🇻🇳" },
];

const BY_CODE = new Map(
  COUNTRY_CATALOGUE.map((country) => [country.code, country]),
);

export function isKnownCountry(code) {
  return BY_CODE.has(String(code || "").toUpperCase());
}

export function findCountry(code) {
  return BY_CODE.get(String(code || "").toUpperCase()) || null;
}

export function defaultCountryPool(size) {
  return COUNTRY_CATALOGUE.slice(0, size).map((country) => country.code);
}

export const MAX_UNIQUE_COUNTRIES = COUNTRY_CATALOGUE.length;

// Stable regional persona data used by both the popup generator and the native
// host. A numbered profile always receives the country at the same position in
// the selected list, together with that country's locale and timezone.
const PERSONA_BY_COUNTRY = {
  AL: ["sq-AL", "Europe/Tirane"], AR: ["es-AR", "America/Argentina/Buenos_Aires"],
  AU: ["en-AU", "Australia/Sydney"], AT: ["de-AT", "Europe/Vienna"],
  AZ: ["az-AZ", "Asia/Baku"], BE: ["nl-BE", "Europe/Brussels"],
  BA: ["bs-BA", "Europe/Sarajevo"], BR: ["pt-BR", "America/Sao_Paulo"],
  BG: ["bg-BG", "Europe/Sofia"], CA: ["en-CA", "America/Toronto"],
  CL: ["es-CL", "America/Santiago"], CO: ["es-CO", "America/Bogota"],
  CR: ["es-CR", "America/Costa_Rica"], HR: ["hr-HR", "Europe/Zagreb"],
  CY: ["el-CY", "Asia/Nicosia"], CZ: ["cs-CZ", "Europe/Prague"],
  DK: ["da-DK", "Europe/Copenhagen"], EE: ["et-EE", "Europe/Tallinn"],
  FI: ["fi-FI", "Europe/Helsinki"], FR: ["fr-FR", "Europe/Paris"],
  GE: ["ka-GE", "Asia/Tbilisi"], DE: ["de-DE", "Europe/Berlin"],
  GR: ["el-GR", "Europe/Athens"], HK: ["zh-HK", "Asia/Hong_Kong"],
  HU: ["hu-HU", "Europe/Budapest"], IS: ["is-IS", "Atlantic/Reykjavik"],
  IN: ["en-IN", "Asia/Kolkata"], ID: ["id-ID", "Asia/Jakarta"],
  IE: ["en-IE", "Europe/Dublin"], IL: ["he-IL", "Asia/Jerusalem"],
  IT: ["it-IT", "Europe/Rome"], JP: ["ja-JP", "Asia/Tokyo"],
  KZ: ["kk-KZ", "Asia/Almaty"], LV: ["lv-LV", "Europe/Riga"],
  LT: ["lt-LT", "Europe/Vilnius"], LU: ["fr-LU", "Europe/Luxembourg"],
  MY: ["ms-MY", "Asia/Kuala_Lumpur"], MX: ["es-MX", "America/Mexico_City"],
  MD: ["ro-MD", "Europe/Chisinau"], NL: ["nl-NL", "Europe/Amsterdam"],
  NZ: ["en-NZ", "Pacific/Auckland"], NG: ["en-NG", "Africa/Lagos"],
  MK: ["mk-MK", "Europe/Skopje"], NO: ["nb-NO", "Europe/Oslo"],
  PY: ["es-PY", "America/Asuncion"], PH: ["en-PH", "Asia/Manila"],
  PL: ["pl-PL", "Europe/Warsaw"], PT: ["pt-PT", "Europe/Lisbon"],
  RO: ["ro-RO", "Europe/Bucharest"], RS: ["sr-RS", "Europe/Belgrade"],
  SG: ["en-SG", "Asia/Singapore"], SK: ["sk-SK", "Europe/Bratislava"],
  SI: ["sl-SI", "Europe/Ljubljana"], ZA: ["en-ZA", "Africa/Johannesburg"],
  KR: ["ko-KR", "Asia/Seoul"], ES: ["es-ES", "Europe/Madrid"],
  SE: ["sv-SE", "Europe/Stockholm"], CH: ["de-CH", "Europe/Zurich"],
  TW: ["zh-TW", "Asia/Taipei"], TH: ["th-TH", "Asia/Bangkok"],
  TR: ["tr-TR", "Europe/Istanbul"], UA: ["uk-UA", "Europe/Kyiv"],
  AE: ["ar-AE", "Asia/Dubai"], GB: ["en-GB", "Europe/London"],
  US: ["en-US", "America/New_York"], VN: ["vi-VN", "Asia/Ho_Chi_Minh"],
};

const SCREEN_PRESETS = [
  [1366, 768], [1440, 900], [1536, 864], [1280, 720], [1600, 900],
  [1920, 1080], [1280, 800], [1680, 1050], [1024, 768], [1280, 1024],
  [1440, 960], [1600, 1000], [1360, 768], [1470, 956], [1512, 982],
  [1728, 1117], [1920, 1200], [2048, 1152], [2560, 1440], [3840, 2160],
];

export function personaForCountry(code, slotIndex = 0) {
  const country = findCountry(code);
  if (!country) {
    return null;
  }
  const [locale, timezoneId] = PERSONA_BY_COUNTRY[country.code] || ["en-US", "UTC"];
  const preset = SCREEN_PRESETS[slotIndex];
  const [width, height] = preset || [1000 + slotIndex * 17, 700 + slotIndex * 9];
  return { country, width, height, locale, timezoneId };
}
