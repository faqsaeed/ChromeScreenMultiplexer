import test from "node:test";
import assert from "node:assert/strict";
import { parseProxyLine, validateLaunchPayload } from "./lib.mjs";

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
