const MAX_SESSIONS = 100;
const MIN_WIDTH = 320;
const MAX_WIDTH = 3840;
const MIN_HEIGHT = 400;
const MAX_HEIGHT = 2160;

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

  return {
    targetUrl: target.href,
    count,
    environments,
    proxies,
    directMode,
  };
}
