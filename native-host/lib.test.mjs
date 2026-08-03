import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ACTIVE_SESSIONS,
  parseProxyLine,
  requiredCountryCount,
  validateDashboardConfig,
  validateLaunchPayload,
} from "./lib.mjs";

function environments(count) {
  return Array.from({ length: count }, (_, index) => ({
    width: 1000 + index * 10,
    height: 700 + index * 5,
    locale: "en-US",
    timezoneId: "America/New_York",
  }));
}

function vpnPayload(overrides = {}) {
  const count = overrides.count ?? 2;
  return {
    authorized: true,
    directMode: true,
    targetUrl: "https://staging.example.com",
    count,
    environments: environments(count),
    proxyLines: [],
    ...overrides,
    vpn: {
      enabled: true,
      extensionPath: "/opt/surfshark",
      username: "qa@example.com",
      password: "secret",
      countries: ["DE", "JP"],
      ...(overrides.vpn || {}),
    },
  };
}

test("parses IPRoyal host:port:username:password format", () => {
  assert.deepEqual(
    parseProxyLine(
      "geo.iproyal.com:12321:qa_user:secret_country-us_session-Ab12Cd34",
    ),
    {
      server: "http://geo.iproyal.com:12321",
      username: "qa_user",
      password: "secret_country-us_session-Ab12Cd34",
    },
  );
});

test("keeps colons that occur inside a proxy password", () => {
  assert.equal(
    parseProxyLine("proxy.example:8080:user:part:two").password,
    "part:two",
  );
});

test("accepts an authenticated proxy URL", () => {
  assert.deepEqual(
    parseProxyLine("http://user:pass@proxy.example:8080"),
    {
      server: "http://proxy.example:8080",
      username: "user",
      password: "pass",
    },
  );
});

test("validates a complete authorized launch matrix", () => {
  const result = validateLaunchPayload({
    authorized: true,
    targetUrl: "https://staging.example.com",
    count: 2,
    environments: [
      {
        width: 1366,
        height: 768,
        locale: "en-US",
        timezoneId: "America/New_York",
      },
      {
        width: 1440,
        height: 900,
        locale: "en-GB",
        timezoneId: "Europe/London",
      },
    ],
    proxyLines: [
      "geo.iproyal.com:12321:user:pass_session-One",
      "geo.iproyal.com:12321:user:pass_session-Two",
    ],
  });

  assert.equal(result.count, 2);
  assert.equal(result.targetUrl, "https://staging.example.com/");
});

test("accepts a matrix of 100 queued test configurations", () => {
  const environments = Array.from({ length: 100 }, (_, index) => ({
    width: 1000 + index * 10,
    height: 700 + index * 5,
    locale: "en-US",
    timezoneId: "America/New_York",
  }));
  const proxyLines = Array.from(
    { length: 100 },
    (_, index) =>
      `geo.iproyal.com:12321:user:pass_session-Queue${index + 1}`,
  );

  const result = validateLaunchPayload({
    authorized: true,
    targetUrl: "https://staging.example.com",
    count: 100,
    environments,
    proxyLines,
  });

  assert.equal(result.count, 100);
});

test("accepts a direct-connection dry run without proxy rows", () => {
  const result = validateLaunchPayload({
    authorized: true,
    directMode: true,
    targetUrl: "https://example.com",
    count: 2,
    environments: [
      {
        width: 1366,
        height: 768,
        locale: "en-US",
        timezoneId: "America/New_York",
      },
      {
        width: 1440,
        height: 900,
        locale: "en-GB",
        timezoneId: "Europe/London",
      },
    ],
    proxyLines: [],
  });

  assert.equal(result.directMode, true);
  assert.deepEqual(result.proxies, [null, null]);
});

test("rejects proxy rows in direct-connection dry-run mode", () => {
  assert.throws(
    () =>
      validateLaunchPayload({
        authorized: true,
        directMode: true,
        targetUrl: "https://example.com",
        count: 1,
        environments: [
          {
            width: 1366,
            height: 768,
            locale: "en-US",
            timezoneId: "America/New_York",
          },
        ],
        proxyLines: ["geo.iproyal.com:12321:user:password"],
      }),
    /must not include proxy rows/,
  );
});

test("rejects more than 100 test configurations", () => {
  assert.throws(
    () =>
      validateLaunchPayload({
        authorized: true,
        targetUrl: "https://staging.example.com",
        count: 101,
        environments: [],
        proxyLines: [],
      }),
    /between 1 and 100/,
  );
});

test("rejects repeated proxy configurations", () => {
  assert.throws(
    () =>
      validateLaunchPayload({
        authorized: true,
        targetUrl: "https://staging.example.com",
        count: 2,
        environments: [
          {
            width: 1366,
            height: 768,
            locale: "en-US",
            timezoneId: "America/New_York",
          },
          {
            width: 1440,
            height: 900,
            locale: "en-GB",
            timezoneId: "Europe/London",
          },
        ],
        proxyLines: [
          "geo.iproyal.com:12321:user:duplicate",
          "geo.iproyal.com:12321:user:duplicate",
        ],
      }),
    /Every proxy configuration must be unique/,
  );
});

test("requires different screen dimensions for every session", () => {
  assert.throws(
    () =>
      validateLaunchPayload({
        authorized: true,
        targetUrl: "https://staging.example.com",
        count: 2,
        environments: [
          {
            width: 1366,
            height: 768,
            locale: "en-US",
            timezoneId: "America/New_York",
          },
          {
            width: 1366,
            height: 768,
            locale: "en-GB",
            timezoneId: "Europe/London",
          },
        ],
        proxyLines: [
          "geo.iproyal.com:12321:user:pass_session-One",
          "geo.iproyal.com:12321:user:pass_session-Two",
        ],
      }),
    /different screen dimensions/,
  );
});

test("requires explicit authorization", () => {
  assert.throws(
    () =>
      validateLaunchPayload({
        authorized: false,
        targetUrl: "https://staging.example.com",
        count: 1,
        environments: [],
        proxyLines: [],
      }),
    /Authorization confirmation is required/,
  );
});

/* ---------------- VPN mode ---------------- */

test("accepts a Surfshark VPN launch with one country per session", () => {
  const result = validateLaunchPayload(vpnPayload());

  assert.equal(result.vpn.provider, "surfshark");
  assert.deepEqual(result.vpn.countries, ["DE", "JP"]);
  assert.equal(result.vpn.password, "secret");
});

test("VPN mode cannot be stacked on IPRoyal proxies", () => {
  assert.throws(
    () =>
      validateLaunchPayload(
        vpnPayload({
          directMode: false,
          proxyLines: [
            "geo.iproyal.com:12321:user:pass_one",
            "geo.iproyal.com:12321:user:pass_two",
          ],
        }),
      ),
    /cannot be combined with IPRoyal proxy rows/,
  );
});

test("rejects a country pool smaller than the concurrent session count", () => {
  assert.throws(
    () => validateLaunchPayload(vpnPayload({ vpn: { countries: ["DE"] } })),
    /Select at least 2 VPN countries/,
  );
});

test("rejects a duplicated country in the pool", () => {
  assert.throws(
    () =>
      validateLaunchPayload(vpnPayload({ vpn: { countries: ["DE", "DE"] } })),
    /duplicate country/,
  );
});

test("rejects a country outside the Surfshark catalogue", () => {
  assert.throws(
    () =>
      validateLaunchPayload(vpnPayload({ vpn: { countries: ["DE", "ZZ"] } })),
    /not in the Surfshark country catalogue/,
  );
});

test("normalises country codes to upper case", () => {
  const result = validateLaunchPayload(
    vpnPayload({ vpn: { countries: ["de", "jp"] } }),
  );
  assert.deepEqual(result.vpn.countries, ["DE", "JP"]);
});

test("fills the country pool from the catalogue when none is chosen", () => {
  const result = validateLaunchPayload(
    vpnPayload({ count: 3, vpn: { countries: [] } }),
  );
  assert.equal(result.vpn.countries.length, 3);
  assert.equal(new Set(result.vpn.countries).size, 3);
});

test("VPN mode requires the extension folder and account credentials", () => {
  assert.throws(
    () => validateLaunchPayload(vpnPayload({ vpn: { extensionPath: "  " } })),
    /path to the unpacked Surfshark extension/,
  );
  assert.throws(
    () => validateLaunchPayload(vpnPayload({ vpn: { password: "" } })),
    /Surfshark account email and password/,
  );
});

test("a run longer than the active cap only needs one country per live profile", () => {
  assert.equal(requiredCountryCount(4), 4);
  assert.equal(requiredCountryCount(100), MAX_ACTIVE_SESSIONS);

  const count = 40;
  const result = validateLaunchPayload({
    authorized: true,
    directMode: true,
    targetUrl: "https://staging.example.com",
    count,
    environments: environments(count),
    proxyLines: [],
    vpn: {
      enabled: true,
      extensionPath: "/opt/surfshark",
      username: "qa@example.com",
      password: "secret",
      countries: [],
    },
  });

  assert.equal(result.vpn.countries.length, MAX_ACTIVE_SESSIONS);
});

test("leaves VPN configuration null when the feature is off", () => {
  const result = validateLaunchPayload({
    authorized: true,
    directMode: true,
    targetUrl: "https://example.com",
    count: 1,
    environments: environments(1),
    proxyLines: [],
  });

  assert.equal(result.vpn, null);
});

/* ---------------- Fleet dashboard ---------------- */

test("defaults the dashboard to off in the bottom-right corner", () => {
  assert.deepEqual(validateDashboardConfig(undefined), {
    enabled: false,
    corner: "bottom-right",
    refreshMs: 4000,
  });
});

test("validates dashboard corner and refresh interval", () => {
  assert.deepEqual(
    validateDashboardConfig({ enabled: true, corner: "top-left", refreshMs: 2000 }),
    { enabled: true, corner: "top-left", refreshMs: 2000 },
  );
  assert.throws(
    () => validateDashboardConfig({ enabled: true, corner: "middle" }),
    /Dashboard corner must be one of/,
  );
  assert.throws(
    () => validateDashboardConfig({ enabled: true, refreshMs: 100 }),
    /Dashboard refresh must be/,
  );
});
