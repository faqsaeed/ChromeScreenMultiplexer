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
import {
  COUNTRY_CATALOGUE,
  findCountry,
  personaForCountry,
} from "./countries.js";
import {
  connectSurfshark,
  extensionLaunchArgs,
} from "./vpn/surfshark.mjs";

const PROFILE_ROOT = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"),
  "AuthorizedChromeQaLauncher",
);
const SESSION_PROFILE_ROOT = path.join(PROFILE_ROOT, "profiles");
const PROFILE_REGISTRY_FILE = path.join(PROFILE_ROOT, "personas.json");
const SETUP_VPN_CHECK_INTERVAL_MS = 10_000;
// Starting many full Chrome profiles at the same instant can starve extension
// service workers on smaller hosts. This only limits startup work; it does not
// reduce the configured number of concurrently open profiles.
const MAX_PARALLEL_STARTUPS = 2;
const OCCUPYING_STATES = new Set([
  "launching",
  "vpn-signin",
  "vpn-connecting",
  "vpn-connected",
  "ip-check",
  "navigating",
  "running",
  "setup",
  "attention",
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
let personaRegistry = {};
const vpnProbeInProgress = new Set();

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

async function removeProfile(profileDir) {
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

function profileDirectory(index) {
  return path.join(SESSION_PROFILE_ROOT, `profile-${String(index).padStart(3, "0")}`);
}

async function resolvePersistentPersonas(config) {
  if (!config.vpn) {
    return;
  }
  await fs.mkdir(PROFILE_ROOT, { recursive: true });
  try {
    personaRegistry = JSON.parse(await fs.readFile(PROFILE_REGISTRY_FILE, "utf8"));
  } catch {
    personaRegistry = {};
  }

  const requested = config.vpn.countries;
  const used = new Set();
  const codes = [];
  for (let index = 0; index < config.count; index += 1) {
    const saved = String(personaRegistry[index + 1]?.country || "").toUpperCase();
    let code = findCountry(saved) && !used.has(saved) ? saved : null;
    if (!code) {
      code =
        requested.find((candidate) => !used.has(candidate)) ||
        COUNTRY_CATALOGUE.find((candidate) => !used.has(candidate.code))?.code;
    }
    if (!code) {
      throw new Error("There are not enough unique Surfshark countries for the persistent profiles.");
    }
    used.add(code);
    codes.push(code);
    personaRegistry[index + 1] = { country: code };
  }

  config.vpn.countries = codes;
  config.environments = codes.map((code, index) => {
    const persona = personaForCountry(code, index);
    return {
      width: persona.width,
      height: persona.height,
      locale: persona.locale,
      timezoneId: persona.timezoneId,
    };
  });
  await fs.writeFile(
    PROFILE_REGISTRY_FILE,
    `${JSON.stringify(personaRegistry, null, 2)}\n`,
    "utf8",
  );
}

async function forgetPersistentPersona(index) {
  try {
    personaRegistry = JSON.parse(await fs.readFile(PROFILE_REGISTRY_FILE, "utf8"));
  } catch {
    personaRegistry = {};
  }
  delete personaRegistry[index];
  await fs.mkdir(PROFILE_ROOT, { recursive: true });
  await fs.writeFile(
    PROFILE_REGISTRY_FILE,
    `${JSON.stringify(personaRegistry, null, 2)}\n`,
    "utf8",
  );
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

function applyGeoResult(record, geo) {
  record.ip = geo.ip;
  record.ipCountry = geo.countryCode;
  record.city = geo.city;
  record.ipCheckedAt = geo.checkedAt;
  record.geoOk = record.country && geo.countryCode
    ? geo.countryCode === record.country.code
    : null;
  record.vpnCheck = record.geoOk === true
    ? "connected"
    : record.geoOk === false
      ? "mismatch"
      : "unknown";
  record.warning = record.geoOk === false
    ? `Assigned ${record.country.code}, but the current exit IP reports ${geo.countryCode}. Check that Surfshark is connected to ${record.country.name}.`
    : null;
}

async function probeSetupVpn(record) {
  if (!record.context || record.state !== "setup" || vpnProbeInProgress.has(record.id)) {
    return;
  }
  vpnProbeInProgress.add(record.id);
  const previousCheck = record.vpnCheck;
  record.vpnCheck = "checking";
  try {
    const geo = await probePublicIp(record.context, {
      timeoutMs: 7000,
      serviceWorkerOnly: true,
    });
    applyGeoResult(record, geo);
  } catch (error) {
    if (error.message.includes("worker is not active")) {
      record.vpnCheck = record.ip ? previousCheck : "not-installed";
    } else {
      record.vpnCheck = "unreachable";
      record.warning = `VPN status check failed: ${error.message}`;
    }
    record.ipCheckedAt = new Date().toISOString();
  } finally {
    vpnProbeInProgress.delete(record.id);
  }
}

function scheduleSetupVpnChecks() {
  const now = Date.now();
  for (const record of roster) {
    const lastCheck = Date.parse(record.ipCheckedAt || "") || 0;
    if (
      record.state === "setup" &&
      record.context &&
      now - lastCheck >= SETUP_VPN_CHECK_INTERVAL_MS
    ) {
      void probeSetupVpn(record);
    }
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
      activeLimit: activeConfig?.activeLimit ?? MAX_ACTIVE_SESSIONS,
      queueMode: activeConfig?.queueMode ?? "auto",
      targetUrl: activeConfig?.targetUrl ?? null,
      persistentProfiles: true,
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
      vpnCheck: record.vpnCheck,
      ipCheckedAt: record.ipCheckedAt,
      profileDir: record.profileDir,
    })),
    countries: allocator
      ? allocator.snapshot().map((country) => {
          const record = roster.find((item) => item.id === country.holder);
          return {
            ...country,
            holder: record ? `Profile ${record.index}` : null,
            connected: record?.vpnCheck === "connected",
            ip: record?.ip || null,
            exitCountry: record?.ipCountry || null,
          };
        })
      : [],
  };
}

async function pollTelemetry() {
  scheduleSetupVpnChecks();
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
    // A profile owns the same persona on every run. The ledger still reserves
    // that fixed country while Chrome is live to catch accidental overlap.
    record.country = allocator.claimCode(record.country.code, record.id);
    progress(
      `Session ${record.index}: reserved ${record.country.name} (${record.country.code}).`,
    );
  }

  progress(
    `Opening session ${record.index}/${config.count} at ${environment.width}×${environment.height}…`,
  );

  await fs.mkdir(SESSION_PROFILE_ROOT, { recursive: true });
  const profileDir = record.profileDir;
  await fs.mkdir(profileDir, { recursive: true });

  let context;
  try {
    const launchOptions = {
      channel: "chrome",
      headless: false,
      ignoreDefaultArgs: ["--no-sandbox"],
      viewport: { width: environment.width, height: environment.height },
      screen: { width: environment.width, height: environment.height },
      locale: environment.locale,
      timezoneId: environment.timezoneId,
      args: [
        `--window-size=${environment.width},${environment.height}`,
        "--no-first-run",
        "--no-default-browser-check",
        ...(vpn?.extensionPath ? extensionLaunchArgs(vpn.extensionPath) : []),
      ],
    };

    if (record.proxy) {
      launchOptions.proxy = record.proxy;
    }
    if (vpn) {
      // Playwright disables extensions by default. Keep extensions enabled so
      // either an advanced unpacked build or the profile's normal Web Store
      // installation of Surfshark can run.
      launchOptions.ignoreDefaultArgs.push("--disable-extensions");
      launchOptions.ignoreDefaultArgs.push("--disable-background-networking");
    }

    context = await chromium.launchPersistentContext(profileDir, launchOptions);

    if (generation !== launchGeneration) {
      await context.close();
      allocator?.releaseAllFor(record.id);
      setState(record, "closed");
      return false;
    }

    record.context = context;

    context.on("close", () => {
      record.context = null;
      record.page = null;
      allocator?.releaseAllFor(record.id);
      if (record.state !== "failed") {
        setState(record, "closed");
      }
      void pumpQueue();
    });

    if (vpn) {
      if (config.prepareOnly) {
        // Preparation is intentionally passive. Do not probe the extension or
        // navigate anywhere: the user installs, signs in, and selects the
        // dashboard-assigned country manually. Any setup page failure used to
        // close the whole persistent context via the catch block below.
        setState(record, "setup");
        progress(
          `Profile ${record.index}: ready for manual setup. Install Surfshark, sign in, and connect ${record.country.name}. This window will remain open until you close it.`,
        );
        return true;
      }

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
      applyGeoResult(record, geo);

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
    record.page = page;
    try {
      await page.goto(config.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
    } catch (error) {
      // A VPN exit can be temporarily unavailable. Keep the persistent Chrome
      // window open so the user can reconnect Surfshark or enter another URL.
      record.warning = `Target page could not be loaded: ${error.message}`;
    }

    setState(record, "running");
    return true;
  } catch (error) {
    if (context && record.context) {
      record.page = context
        .pages()
        .find((page) => !page.url().startsWith("chrome-extension://")) || null;
      record.vpnCheck = record.vpnCheck === "not-checked"
        ? "attention"
        : record.vpnCheck;
      setState(record, "attention", error.message);
      progress(
        `Profile ${record.index} needs attention but was kept open: ${error.message}`,
      );
      return true;
    }

    setState(record, "failed", error.message);
    allocator?.releaseAllFor(record.id);
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
      const openSlots = run.config.activeLimit - activeRecords().length;
      const availableSlots =
        run.config.queueMode === "manual"
          ? Math.min(openSlots, run.manualCredits)
          : openSlots;
      const pending = queuedRecords();
      if (availableSlots <= 0 || pending.length === 0) {
        break;
      }

      const batch = pending.slice(
        0,
        Math.min(availableSlots, MAX_PARALLEL_STARTUPS),
      );
      if (run.config.queueMode === "manual") {
        run.manualCredits -= batch.length;
      }
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
      `${activeRecords().length} active; ${queuedRecords().length} queued. ${
        run.config.queueMode === "manual"
          ? "Use Promote next in the fleet dashboard when you want another profile."
          : "Close a test window to open the next session."
      }`,
    );
  } finally {
    pumpInProgress = false;
  }
}

async function navigateFleet(rawUrl) {
  const target = new URL(String(rawUrl || ""));
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Target URL must use HTTP or HTTPS.");
  }
  const targetUrl = target.href;
  if (activeConfig) {
    activeConfig.targetUrl = targetUrl;
  }
  if (currentRun) {
    currentRun.config.targetUrl = targetUrl;
  }

  const pages = roster.filter((record) => record.page).map((record) => record.page);
  const results = await Promise.allSettled(
    pages.map((page) =>
      page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }),
    ),
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  progress(
    `Target updated to ${targetUrl}. Navigated ${pages.length - failed} running profile${
      pages.length - failed === 1 ? "" : "s"
    }${failed ? `; ${failed} failed` : ""}. Queued profiles will use it when promoted.`,
  );
  return { targetUrl, navigated: pages.length - failed, failed };
}

async function promoteNext() {
  if (!currentRun || queuedRecords().length === 0) {
    throw new Error("There is no queued profile to promote.");
  }
  if (activeRecords().length >= currentRun.config.activeLimit) {
    throw new Error(
      `The active limit (${currentRun.config.activeLimit}) is full. Close a profile first.`,
    );
  }
  currentRun.manualCredits += 1;
  await pumpQueue();
  return { queued: queuedRecords().length };
}

async function resetProfile(index) {
  const slot = Number(index);
  if (!Number.isInteger(slot) || slot < 1 || slot > 100) {
    throw new Error("Profile number is invalid.");
  }
  const record = roster.find((item) => item.index === slot);
  if (record?.context) {
    const context = record.context;
    record.context = null;
    record.page = null;
    setState(record, "closed");
    await context.close().catch(() => {});
  }
  const profileDir = record?.profileDir || profileDirectory(slot);
  await removeProfile(profileDir);
  await forgetPersistentPersona(slot);
  if (record) {
    record.warning = "Persistent profile was reset; its next launch starts clean.";
  }
  progress(`Persistent profile ${slot} was reset.`);
  return { index: slot };
}

async function closeProfile(index) {
  const slot = Number(index);
  const record = roster.find((item) => item.index === slot);
  if (!record?.context) {
    throw new Error(`Profile ${slot} is not currently open.`);
  }
  await record.context.close();
  progress(`Profile ${slot} was closed. Its persistent data was kept.`);
  return { index: slot };
}

async function handleDashboardCommand(command) {
  let result;
  switch (command?.action) {
    case "navigate":
      result = await navigateFleet(command.url);
      break;
    case "promoteNext":
      result = await promoteNext();
      break;
    case "resetProfile":
      result = await resetProfile(command.index);
      break;
    case "closeProfile":
      result = await closeProfile(command.index);
      break;
    case "stopAll":
      setTimeout(() => {
        void stopAll().catch((error) => send({ type: "error", message: error.message }));
      }, 100);
      result = { stopped: true };
      break;
    default:
      throw new Error("Unknown dashboard command.");
  }
  await pollTelemetry().catch(() => {});
  return result;
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
      onCommand: handleDashboardCommand,
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
    await resolvePersistentPersonas(config);
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
    country: config.vpn ? findCountry(config.vpn.countries[index]) : null,
    ip: null,
    ipCountry: null,
    city: null,
    geoOk: null,
    error: null,
    warning: null,
    vpnCheck: "not-checked",
    ipCheckedAt: null,
    context: null,
    profileDir: profileDirectory(index + 1),
    page: null,
    rssBytes: null,
    cpuPercent: null,
    processCount: 0,
    rootPid: null,
  }));

  const generation = ++launchGeneration;
  currentRun = {
    config,
    generation,
    launched: 0,
    errors: [],
    manualCredits: config.activeLimit,
  };

  send({
    type: "accepted",
    count: config.count,
    maxActive: config.activeLimit,
    directMode: config.directMode,
    vpnEnabled: Boolean(config.vpn),
    prepareOnly: config.prepareOnly,
    queueMode: config.queueMode,
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
      const { context } = record;
      record.context = null;
      setState(record, "closed");
      await context.close().catch(() => {});
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
