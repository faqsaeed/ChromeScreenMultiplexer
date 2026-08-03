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
