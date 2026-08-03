#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { MAX_ACTIVE_SESSIONS, validateLaunchPayload } from "./lib.mjs";
import { CountryAllocator } from "./country-allocator.mjs";
import { createSystemMonitor } from "./system-stats.mjs";
import { probePublicIp } from "./ip-check.mjs";
import { openFleetDashboard } from "./dashboard-window.mjs";
import { connectSurfshark, extensionLaunchArgs } from "./vpn/surfshark.mjs";

const PROFILE_ROOT = path.join(os.tmpdir(), "authorized-chrome-qa-launcher");
const OCCUPYING_STATES = new Set([
  "launching",
  "vpn-signin",
  "vpn-connecting",
  "vpn-connected",
  "ip-check",
  "navigating",
  "running",
]);

const monitor = createSystemMonitor();

let inputBuffer = Buffer.alloc(0);
let launchGeneration = 0;
let currentRun = null;
// Outlives currentRun, which is cleared as soon as the queue drains, so the
// monitor keeps reporting the correct routing mode for still-running sessions.
let activeConfig = null;
let pumpInProgress = false;
let roster = [];
let allocator = null;
let dashboard = null;
let telemetryTimer = null;

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

async function removeProfile(profileDir) {
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

function activeRecords() {
  return roster.filter((record) => OCCUPYING_STATES.has(record.state));
}

function queuedRecords() {
  return roster.filter((record) => record.state === "queued");
}

function failedRecords() {
  return roster.filter((record) => record.state === "failed");
}

function setState(record, state, error) {
  record.state = state;
  if (error !== undefined) {
    record.error = error;
  }
}

/* ------------------------------------------------------------------ *
 * Telemetry
 * ------------------------------------------------------------------ */

function buildSnapshot(host) {
  return {
    generatedAt: new Date().toISOString(),
    host,
    run: {
      total: roster.length,
      active: activeRecords().length,
      queued: queuedRecords().length,
      failed: failedRecords().length,
      launching: Boolean(currentRun) || pumpInProgress,
      directMode: activeConfig?.directMode ?? false,
      vpnEnabled: Boolean(activeConfig?.vpn?.enabled),
      maxActive: MAX_ACTIVE_SESSIONS,
    },
    sessions: roster.map((record) => ({
      index: record.index,
      id: record.id,
      state: record.state,
      vpnEnabled: Boolean(activeConfig?.vpn?.enabled),
      country: record.country
        ? {
            code: record.country.code,
            name: record.country.name,
            flag: record.country.flag,
          }
        : null,
      ip: record.ip,
      ipCountry: record.ipCountry,
      city: record.city,
      geoOk: record.geoOk,
      viewport: `${record.environment.width}×${record.environment.height}`,
      locale: record.environment.locale,
      timezoneId: record.environment.timezoneId,
      rssBytes: record.rssBytes,
      cpuPercent: record.cpuPercent,
      processCount: record.processCount,
      rootPid: record.rootPid,
      error: record.error,
      warning: record.warning,
    })),
    countries: allocator ? allocator.snapshot() : [],
  };
}

async function pollTelemetry() {
  const targets = roster
    .filter((record) => record.profileDir && OCCUPYING_STATES.has(record.state))
    .map((record) => ({ id: record.id, profileDir: record.profileDir }));

  const { host, sessions } = await monitor.sample(targets);

  for (const record of roster) {
    const stats = sessions.get(record.id);
    if (stats) {
      record.rssBytes = stats.rssBytes;
      record.cpuPercent = stats.cpuPercent;
      record.processCount = stats.processCount;
      record.rootPid = stats.rootPid;
    } else if (!OCCUPYING_STATES.has(record.state)) {
      record.rssBytes = null;
      record.cpuPercent = null;
      record.processCount = 0;
      record.rootPid = null;
    }
  }

  const snapshot = buildSnapshot(host);

  if (dashboard) {
    const delivered = await dashboard.push(snapshot);
    if (!delivered && !dashboard.isAlive()) {
      dashboard = null;
    }
  }

  send({ type: "fleet", snapshot });
}

function startTelemetry(refreshMs) {
  stopTelemetry();
  telemetryTimer = setInterval(() => {
    void pollTelemetry().catch(() => {});
  }, refreshMs);
  telemetryTimer.unref?.();
  void pollTelemetry().catch(() => {});
}

function stopTelemetry() {
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

function progress(message) {
  send({ type: "progress", message });
}

async function createSession(record, config, generation) {
  const { environment } = record;
  const vpn = config.vpn;

  setState(record, "launching", null);

  if (vpn) {
    // Reserve the country before Chrome starts so the ledger can never hand
    // the same one to a session launching in parallel.
    record.country = allocator.claim(record.id);
    progress(
      `Session ${record.index}: reserved ${record.country.name} (${record.country.code}).`,
    );
  }

  progress(
    `Opening session ${record.index}/${config.count} at ${environment.width}×${environment.height}…`,
  );

  await fs.mkdir(PROFILE_ROOT, { recursive: true });
  const profileDir = await fs.mkdtemp(
    path.join(PROFILE_ROOT, `session-${record.index}-`),
  );
  record.profileDir = profileDir;

  let context;
  try {
    const launchOptions = {
      channel: "chrome",
      headless: false,
      viewport: { width: environment.width, height: environment.height },
      screen: { width: environment.width, height: environment.height },
      locale: environment.locale,
      timezoneId: environment.timezoneId,
      args: [
        `--window-size=${environment.width},${environment.height}`,
        "--no-first-run",
        "--no-default-browser-check",
        ...(vpn ? extensionLaunchArgs(vpn.extensionPath) : []),
      ],
    };

    if (record.proxy) {
      launchOptions.proxy = record.proxy;
    }
    if (vpn) {
      // Playwright disables extensions by default, which would drop Surfshark.
      launchOptions.ignoreDefaultArgs = ["--disable-extensions"];
    }

    context = await chromium.launchPersistentContext(profileDir, launchOptions);

    if (generation !== launchGeneration) {
      await context.close();
      await removeProfile(profileDir);
      allocator?.releaseAllFor(record.id);
      setState(record, "closed");
      return false;
    }

    record.context = context;

    context.on("close", () => {
      record.context = null;
      allocator?.releaseAllFor(record.id);
      if (record.state !== "failed") {
        setState(record, "closed");
      }
      void removeProfile(profileDir);
      void pumpQueue();
    });

    if (vpn) {
      setState(record, "vpn-signin");
      await connectSurfshark({
        context,
        extensionPath: vpn.extensionPath,
        username: vpn.username,
        password: vpn.password,
        country: record.country,
        connectTimeoutMs: vpn.connectTimeoutMs,
        onProgress: (message) => {
          setState(record, "vpn-connecting");
          progress(`Session ${record.index}: ${message}`);
        },
      });
      setState(record, "vpn-connected");
    }

    setState(record, "ip-check");
    try {
      const geo = await probePublicIp(context);
      record.ip = geo.ip;
      record.ipCountry = geo.countryCode;
      record.city = geo.city;
      record.geoOk = record.country
        ? geo.countryCode === record.country.code
        : null;

      if (record.country && record.geoOk === false) {
        progress(
          `Session ${record.index}: warning — assigned ${record.country.code} but the exit IP reports ${geo.countryCode || "unknown"}.`,
        );
      }
    } catch (error) {
      // A failed lookup is worth surfacing, but it should not fail the session.
      record.ip = null;
      record.warning = `IP check failed: ${error.message}`;
    }

    setState(record, "navigating");
    const pages = context.pages();
    const page = pages[0] || (await context.newPage());
    await page.goto(config.targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    setState(record, "running");
    return true;
  } catch (error) {
    setState(record, "failed", error.message);
    if (context) {
      await context.close().catch(() => {});
    }
    await removeProfile(profileDir);
    allocator?.releaseAllFor(record.id);
    record.profileDir = null;
    throw error;
  }
}

async function pumpQueue() {
  if (pumpInProgress || !currentRun) {
    return;
  }

  pumpInProgress = true;
  const run = currentRun;

  try {
    while (currentRun === run && run.generation === launchGeneration) {
      const availableSlots = MAX_ACTIVE_SESSIONS - activeRecords().length;
      const pending = queuedRecords();
      if (availableSlots <= 0 || pending.length === 0) {
        break;
      }

      const batch = pending.slice(0, availableSlots);
      const results = await Promise.all(
        batch.map(async (record) => {
          try {
            return await createSession(record, run.config, run.generation);
          } catch (error) {
            run.errors.push(`Session ${record.index}: ${error.message}`);
            progress(
              `Session ${record.index} failed; continuing with the remaining tests.`,
            );
            return false;
          }
        }),
      );

      run.launched += results.filter(Boolean).length;
    }

    if (currentRun !== run || run.generation !== launchGeneration) {
      return;
    }

    if (queuedRecords().length === 0) {
      currentRun = null;
      send({
        type: "complete",
        launched: run.launched,
        failed: run.errors.length,
        errors: run.errors,
      });
      return;
    }

    progress(
      `${activeRecords().length} active; ${queuedRecords().length} queued. Close a test window to open the next session.`,
    );
  } finally {
    pumpInProgress = false;
  }
}

async function startDashboard(config) {
  if (!config.dashboard.enabled) {
    return;
  }

  try {
    await fs.mkdir(PROFILE_ROOT, { recursive: true });
    dashboard = await openFleetDashboard({
      corner: config.dashboard.corner,
      profileDir: path.join(PROFILE_ROOT, "fleet-dashboard"),
    });
    progress(
      dashboard.pinned
        ? "Fleet monitor pinned on top."
        : "Fleet monitor opened. It is corner-positioned but not always-on-top on this platform.",
    );
  } catch (error) {
    dashboard = null;
    progress(`Fleet monitor unavailable: ${error.message}`);
  }
}

async function launchAll(payload) {
  if (currentRun || pumpInProgress) {
    send({ type: "error", message: "A launch is already in progress." });
    return;
  }
  if (activeRecords().length > 0) {
    send({
      type: "error",
      message: "Stop the active test sessions before starting another set.",
    });
    return;
  }

  let config;
  try {
    config = validateLaunchPayload(payload);
  } catch (error) {
    send({ type: "error", message: error.message });
    return;
  }

  activeConfig = config;
  allocator = config.vpn ? new CountryAllocator(config.vpn.countries) : null;
  roster = Array.from({ length: config.count }, (_, index) => ({
    id: crypto.randomUUID(),
    index: index + 1,
    state: "queued",
    environment: config.environments[index],
    proxy: config.proxies[index],
    country: null,
    ip: null,
    ipCountry: null,
    city: null,
    geoOk: null,
    error: null,
    warning: null,
    context: null,
    profileDir: null,
    rssBytes: null,
    cpuPercent: null,
    processCount: 0,
    rootPid: null,
  }));

  const generation = ++launchGeneration;
  currentRun = { config, generation, launched: 0, errors: [] };

  send({
    type: "accepted",
    count: config.count,
    maxActive: MAX_ACTIVE_SESSIONS,
    directMode: config.directMode,
    vpnEnabled: Boolean(config.vpn),
    countryPool: config.vpn ? config.vpn.countries : [],
  });

  await startDashboard(config);
  startTelemetry(config.dashboard.refreshMs);
  await pumpQueue();
}

async function stopAll() {
  launchGeneration += 1;
  const cancelled = queuedRecords().length;
  currentRun = null;
  stopTelemetry();

  const live = roster.filter((record) => record.context);
  await Promise.all(
    live.map(async (record) => {
      const { context, profileDir } = record;
      record.context = null;
      setState(record, "closed");
      await context.close().catch(() => {});
      if (profileDir) {
        await removeProfile(profileDir);
      }
    }),
  );

  for (const record of queuedRecords()) {
    setState(record, "closed");
  }

  allocator?.releaseAll();
  allocator = null;
  activeConfig = null;
  roster = [];

  if (dashboard) {
    await dashboard.close().catch(() => {});
    dashboard = null;
  }

  send({ type: "stopped", count: live.length, cancelled });
}

function handleMessage(message) {
  switch (message?.action) {
    case "launch":
      void launchAll(message.payload).catch((error) => {
        currentRun = null;
        send({ type: "error", message: error.message });
      });
      break;
    case "stopAll":
      void stopAll().catch((error) => {
        send({ type: "error", message: error.message });
      });
      break;
    case "getState":
      send({
        type: "state",
        active: activeRecords().length,
        queued: queuedRecords().length,
        launching: Boolean(currentRun) || pumpInProgress,
      });
      void pollTelemetry().catch(() => {});
      break;
    default:
      send({ type: "error", message: "Unknown launcher action." });
  }
}

function consumeInput() {
  while (inputBuffer.length >= 4) {
    const messageLength = inputBuffer.readUInt32LE(0);
    if (messageLength > 1024 * 1024) {
      send({ type: "error", message: "Native message exceeds the 1 MB limit." });
      inputBuffer = Buffer.alloc(0);
      return;
    }
    if (inputBuffer.length < messageLength + 4) {
      return;
    }

    const body = inputBuffer.subarray(4, messageLength + 4);
    inputBuffer = inputBuffer.subarray(messageLength + 4);

    try {
      handleMessage(JSON.parse(body.toString("utf8")));
    } catch (error) {
      send({ type: "error", message: `Invalid native message: ${error.message}` });
    }
  }
}

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  consumeInput();
});

process.stdin.on("end", () => {
  void stopAll().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  void stopAll().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void stopAll().finally(() => process.exit(0));
});

send({ type: "ready" });
