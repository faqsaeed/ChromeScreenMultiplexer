#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { validateLaunchPayload } from "./lib.mjs";

const PROFILE_ROOT = path.join(os.tmpdir(), "authorized-chrome-qa-launcher");
const MAX_ACTIVE_SESSIONS = 8;
const sessions = new Map();

let inputBuffer = Buffer.alloc(0);
let launchGeneration = 0;
let currentRun = null;
let pumpInProgress = false;

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

async function removeProfile(profileDir) {
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

async function createSession(config, index, generation) {
  const environment = config.environments[index];
  const proxy = config.proxies[index];

  send({
    type: "progress",
    message: `Opening session ${index + 1}/${config.count} at ${
      environment.width
    }×${environment.height}…`,
  });

  await fs.mkdir(PROFILE_ROOT, { recursive: true });
  const profileDir = await fs.mkdtemp(
    path.join(PROFILE_ROOT, `session-${index + 1}-`),
  );

  let context;
  try {
    const launchOptions = {
      channel: "chrome",
      headless: false,
      viewport: {
        width: environment.width,
        height: environment.height,
      },
      screen: {
        width: environment.width,
        height: environment.height,
      },
      locale: environment.locale,
      timezoneId: environment.timezoneId,
      args: [
        `--window-size=${environment.width},${environment.height}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    };

    if (proxy) {
      launchOptions.proxy = proxy;
    }

    context = await chromium.launchPersistentContext(profileDir, launchOptions);

    if (generation !== launchGeneration) {
      await context.close();
      await removeProfile(profileDir);
      return false;
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { context, profileDir });

    context.on("close", () => {
      sessions.delete(sessionId);
      void removeProfile(profileDir);
      void pumpQueue();
    });

    const pages = context.pages();
    const page = pages[0] || (await context.newPage());
    await page.goto(config.targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    return true;
  } catch (error) {
    if (context) {
      await context.close().catch(() => {});
    }
    await removeProfile(profileDir);
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
    while (
      currentRun === run &&
      run.generation === launchGeneration &&
      sessions.size < MAX_ACTIVE_SESSIONS &&
      run.nextIndex < run.config.count
    ) {
      const availableSlots = MAX_ACTIVE_SESSIONS - sessions.size;
      const batchSize = Math.min(
        availableSlots,
        run.config.count - run.nextIndex,
      );
      const indices = Array.from(
        { length: batchSize },
        (_, offset) => run.nextIndex + offset,
      );
      run.nextIndex += batchSize;

      const results = await Promise.all(
        indices.map(async (index) => {
          try {
            return await createSession(run.config, index, run.generation);
          } catch (error) {
            run.errors.push(`Session ${index + 1}: ${error.message}`);
            send({
              type: "progress",
              message: `Session ${
                index + 1
              } failed; continuing with the remaining tests.`,
            });
            return false;
          }
        }),
      );

      run.launched += results.filter(Boolean).length;
    }

    if (currentRun !== run || run.generation !== launchGeneration) {
      return;
    }

    if (run.nextIndex >= run.config.count) {
      currentRun = null;
      send({
        type: "complete",
        launched: run.launched,
        failed: run.errors.length,
        errors: run.errors,
      });
      return;
    }

    const queued = run.config.count - run.nextIndex;
    send({
      type: "progress",
      message: `${sessions.size} active; ${queued} queued. Close a test window to open the next session.`,
    });
  } finally {
    pumpInProgress = false;
  }
}

async function launchAll(payload) {
  if (currentRun || pumpInProgress) {
    send({ type: "error", message: "A launch is already in progress." });
    return;
  }
  if (sessions.size > 0) {
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

  const generation = ++launchGeneration;
  currentRun = {
    config,
    generation,
    nextIndex: 0,
    launched: 0,
    errors: [],
  };

  send({
    type: "accepted",
    count: config.count,
    maxActive: MAX_ACTIVE_SESSIONS,
    directMode: config.directMode,
  });
  await pumpQueue();
}

async function stopAll() {
  launchGeneration += 1;
  const cancelled = currentRun
    ? currentRun.config.count -
      currentRun.launched -
      currentRun.errors.length
    : 0;
  currentRun = null;

  const active = [...sessions.values()];
  sessions.clear();

  await Promise.all(
    active.map(async ({ context, profileDir }) => {
      await context.close().catch(() => {});
      await removeProfile(profileDir);
    }),
  );

  send({ type: "stopped", count: active.length, cancelled });
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
        active: sessions.size,
        queued: currentRun
          ? currentRun.config.count - currentRun.nextIndex
          : 0,
        launching: Boolean(currentRun) || pumpInProgress,
      });
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
