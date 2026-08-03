/**
 * Reads the public IP a Chrome profile is actually exiting from.
 *
 * The request is made from a page inside the profile so it travels through
 * whatever is routing that profile — a Playwright proxy, or the Surfshark
 * extension's own proxy settings, which only apply to in-profile traffic.
 */
const ENDPOINTS = [
  {
    url: "https://ipinfo.io/json",
    map: (data) => ({
      ip: data.ip,
      countryCode: data.country,
      city: data.city,
      region: data.region,
      org: data.org,
    }),
  },
  {
    url: "https://ipapi.co/json/",
    map: (data) => ({
      ip: data.ip,
      countryCode: data.country_code,
      city: data.city,
      region: data.region,
      org: data.org,
    }),
  },
  {
    url: "https://api.ipify.org?format=json",
    map: (data) => ({ ip: data.ip, countryCode: null }),
  },
];

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Response was not JSON.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function fetchFromPage(page, url, timeoutMs) {
  return page.evaluate(
    async ([target, timeout]) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(target, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    },
    [url, timeoutMs],
  );
}

export async function probePublicIp(context, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  let page;

  try {
    page = await context.newPage();
    await page.goto("about:blank", { timeout: timeoutMs });

    const failures = [];
    for (const endpoint of ENDPOINTS) {
      try {
        const body = await fetchFromPage(page, endpoint.url, timeoutMs);
        const result = endpoint.map(extractJson(body));
        if (!result.ip) {
          throw new Error("Response did not include an IP address.");
        }
        return {
          ...result,
          countryCode: result.countryCode
            ? String(result.countryCode).toUpperCase()
            : null,
          source: endpoint.url,
          checkedAt: new Date().toISOString(),
        };
      } catch (error) {
        failures.push(`${endpoint.url}: ${error.message}`);
      }
    }

    throw new Error(`Every IP endpoint failed. ${failures.join(" | ")}`);
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
