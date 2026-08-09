import {
  defaultCountryPool,
  isKnownCountry,
  personaForCountry,
} from "./countries.js";

const MAX_SESSIONS = 100;
const MIN_WIDTH = 320;
const MAX_WIDTH = 3840;
const MIN_HEIGHT = 400;
const MAX_HEIGHT = 2160;

export const MAX_ACTIVE_SESSIONS = 20;
export const DASHBOARD_CORNERS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const MIN_REFRESH_MS = 1000;
const MAX_REFRESH_MS = 30_000;
const SUPPORTED_VPN_PROVIDERS = ["surfshark"];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeProxyUrl(value) {
  const url = new URL(value);
  assert(
    ["http:", "https:", "socks5:"].includes(url.protocol),
    "Proxy URL must use HTTP, HTTPS, or SOCKS5.",
  );
  assert(url.hostname && url.port, "Proxy URL requires a host and port.");

  return {
    server: `${url.protocol}//${url.hostname}:${url.port}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export function parseProxyLine(value) {
  const line = String(value || "").trim();
  assert(line, "Proxy row cannot be empty.");

  if (line.includes("://")) {
    return normalizeProxyUrl(line);
  }

  const parts = line.split(":");
  assert(
    parts.length === 2 || parts.length >= 4,
    "Proxy row must use host:port or host:port:username:password.",
  );

  const [host, port, username = "", ...passwordParts] = parts;
  const password = passwordParts.join(":");

  assert(host, "Proxy host is missing.");
  assert(/^\d{1,5}$/.test(port), "Proxy port is invalid.");
  assert(Number(port) >= 1 && Number(port) <= 65535, "Proxy port is invalid.");
  assert(
    (username && password) || (!username && !password),
    "Proxy username and password must both be provided.",
  );

  return {
    server: `http://${host}:${port}`,
    username,
    password,
  };
}

function validateEnvironment(environment, index) {
  assert(
    environment && typeof environment === "object",
    `Environment ${index + 1} is missing.`,
  );

  const width = Number(environment.width);
  const height = Number(environment.height);
  const locale = String(environment.locale || "").trim();
  const timezoneId = String(environment.timezoneId || "").trim();

  assert(
    Number.isInteger(width) && width >= MIN_WIDTH && width <= MAX_WIDTH,
    `Environment ${index + 1} width must be ${MIN_WIDTH}-${MAX_WIDTH}.`,
  );
  assert(
    Number.isInteger(height) && height >= MIN_HEIGHT && height <= MAX_HEIGHT,
    `Environment ${index + 1} height must be ${MIN_HEIGHT}-${MAX_HEIGHT}.`,
  );
  assert(
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale),
    `Environment ${index + 1} locale is invalid.`,
  );
  assert(
    /^[A-Za-z0-9_+/-]+$/.test(timezoneId),
    `Environment ${index + 1} timezone is invalid.`,
  );

  return { width, height, locale, timezoneId };
}

/** A fixed persona needs one unique country for every persistent profile slot. */
export function requiredCountryCount(sessionCount) {
  // Countries are personas now, not recyclable runtime resources. Requiring a
  // country for every slot keeps profile N stable across every launch.
  return sessionCount;
}

export function validateVpnConfig(vpn, count, directMode) {
  if (!vpn || vpn.enabled !== true) {
    return null;
  }

  assert(
    directMode === true,
    "VPN mode routes traffic through the Surfshark extension, so it cannot be combined with IPRoyal proxy rows. Enable the direct-connection option.",
  );

  const provider = String(vpn.provider || "surfshark").toLowerCase();
  assert(
    SUPPORTED_VPN_PROVIDERS.includes(provider),
    `Unsupported VPN provider "${provider}".`,
  );

  const extensionPath = String(vpn.extensionPath || "").trim();

  const username = String(vpn.username || "").trim();
  const password = String(vpn.password || "");
  assert(
    Boolean(username) === Boolean(password),
    "Provide both the Surfshark email and password, or leave both blank to use the saved profile login.",
  );

  const needed = requiredCountryCount(count);
  const requested = Array.isArray(vpn.countries) ? vpn.countries : [];
  const countries = (
    requested.length > 0 ? requested : defaultCountryPool(needed)
  ).map((code) => String(code || "").trim().toUpperCase());

  assert(countries.length > 0, "Select at least one VPN country.");
  countries.forEach((code) => {
    assert(
      isKnownCountry(code),
      `"${code}" is not in the Surfshark country catalogue.`,
    );
  });
  assert(
    new Set(countries).size === countries.length,
    "The VPN country list contains a duplicate country.",
  );
  assert(
    countries.length === needed,
    `Select exactly ${needed} VPN countries so every persistent profile gets one fixed country. ${countries.length} selected.`,
  );

  return {
    enabled: true,
    provider,
    extensionPath,
    username,
    password,
    countries,
    verifyGeo: vpn.verifyGeo !== false,
    connectTimeoutMs: 120_000,
  };
}

export function validateDashboardConfig(dashboard) {
  if (!dashboard || dashboard.enabled !== true) {
    return { enabled: false, corner: "bottom-right", refreshMs: 4000 };
  }

  const corner = String(dashboard.corner || "bottom-right");
  assert(
    DASHBOARD_CORNERS.includes(corner),
    `Dashboard corner must be one of: ${DASHBOARD_CORNERS.join(", ")}.`,
  );

  const refreshMs = Number(dashboard.refreshMs ?? 4000);
  assert(
    Number.isFinite(refreshMs) &&
      refreshMs >= MIN_REFRESH_MS &&
      refreshMs <= MAX_REFRESH_MS,
    `Dashboard refresh must be ${MIN_REFRESH_MS}-${MAX_REFRESH_MS} ms.`,
  );

  return { enabled: true, corner, refreshMs: Math.round(refreshMs) };
}

export function validateLaunchPayload(payload) {
  assert(payload && typeof payload === "object", "Launch configuration is missing.");
  assert(
    payload.authorized === true,
    "Authorization confirmation is required.",
  );

  const count = Number(payload.count);
  assert(
    Number.isInteger(count) && count >= 1 && count <= MAX_SESSIONS,
    `Session count must be between 1 and ${MAX_SESSIONS}.`,
  );

  const activeLimit = Number(payload.activeLimit ?? Math.min(count, MAX_ACTIVE_SESSIONS));
  assert(
    Number.isInteger(activeLimit) &&
      activeLimit >= 1 &&
      activeLimit <= Math.min(count, MAX_ACTIVE_SESSIONS),
    `Initial active count must be between 1 and ${Math.min(count, MAX_ACTIVE_SESSIONS)}.`,
  );

  const queueMode = String(payload.queueMode || "auto").toLowerCase();
  assert(
    ["auto", "manual"].includes(queueMode),
    'Queue mode must be "auto" or "manual".',
  );

  const target = new URL(String(payload.targetUrl || ""));
  assert(
    ["http:", "https:"].includes(target.protocol),
    "Target URL must use HTTP or HTTPS.",
  );

  assert(
    Array.isArray(payload.environments) &&
      payload.environments.length === count,
    `Exactly ${count} environments are required.`,
  );

  const environments = payload.environments.map(validateEnvironment);
  const directMode = payload.directMode === true;
  let proxies;

  if (directMode) {
    assert(
      Array.isArray(payload.proxyLines) && payload.proxyLines.length === 0,
      "Direct-connection dry runs must not include proxy rows.",
    );
    proxies = Array.from({ length: count }, () => null);
  } else {
    assert(
      Array.isArray(payload.proxyLines) && payload.proxyLines.length === count,
      `Exactly ${count} proxies are required.`,
    );
    proxies = payload.proxyLines.map((line, index) => {
      try {
        return parseProxyLine(line);
      } catch (error) {
        throw new Error(`Proxy ${index + 1}: ${error.message}`);
      }
    });
  }

  const environmentKeys = environments.map(
    ({ width, height }) => `${width}x${height}`,
  );
  assert(
    new Set(environmentKeys).size === environmentKeys.length,
    "Every test session must use different screen dimensions.",
  );

  if (!directMode) {
    const proxyKeys = proxies.map(
      ({ server, username, password }) => `${server}|${username}|${password}`,
    );
    assert(
      new Set(proxyKeys).size === proxyKeys.length,
      "Every proxy configuration must be unique.",
    );
  }

  const vpn = validateVpnConfig(payload.vpn, count, directMode);
  const dashboard = validateDashboardConfig(payload.dashboard);
  const boundEnvironments = vpn
    ? vpn.countries.map((code, index) => {
        const persona = personaForCountry(code, index);
        return {
          width: persona.width,
          height: persona.height,
          locale: persona.locale,
          timezoneId: persona.timezoneId,
        };
      })
    : environments;

  return {
    targetUrl: target.href,
    count,
    environments: boundEnvironments,
    proxies,
    directMode,
    vpn,
    dashboard,
    activeLimit,
    queueMode,
    prepareOnly: payload.prepareOnly === true,
  };
}
