import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveExtensionId } from "./extension-id.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SELECTORS_FILE = path.join(moduleDir, "surfshark.selectors.json");
const LOCAL_SELECTORS_FILE = path.join(
  moduleDir,
  "surfshark.selectors.local.json",
);

let cachedSelectors = null;

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * `surfshark.selectors.local.json` overrides the checked-in map step by step,
 * so a Surfshark UI change can be fixed without touching tracked files.
 */
export async function loadSelectors() {
  if (cachedSelectors) {
    return cachedSelectors;
  }

  const base = await readJson(SELECTORS_FILE);
  if (!base) {
    throw new Error(`Missing Surfshark selector map at ${SELECTORS_FILE}.`);
  }

  const local = await readJson(LOCAL_SELECTORS_FILE);
  cachedSelectors = {
    popupPaths: local?.popupPaths || base.popupPaths,
    steps: { ...base.steps, ...(local?.steps || {}) },
  };
  return cachedSelectors;
}

export async function readExtensionManifest(extensionPath) {
  const manifestPath = path.join(extensionPath, "manifest.json");
  let raw;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch {
    throw new Error(
      `No manifest.json in "${extensionPath}". Point VPN mode at the unpacked Surfshark extension directory.`,
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse ${manifestPath}: ${error.message}`);
  }
}

export function extensionLaunchArgs(extensionPath) {
  return [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ];
}

function fill(candidates, country) {
  return candidates.map((selector) =>
    selector.replaceAll("{country}", country),
  );
}

/**
 * Races the candidate selectors and returns the first one to become visible.
 * Rejections are collected so a failure can name every selector that was tried.
 */
async function firstVisible(page, candidates, timeoutMs) {
  if (!candidates || candidates.length === 0) {
    throw new Error("No selector candidates configured.");
  }

  const attempts = candidates.map(async (selector) => {
    await page
      .locator(selector)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
    return selector;
  });

  // Swallow individual rejections; Promise.any reports them together.
  attempts.forEach((attempt) => attempt.catch(() => {}));

  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

async function requireVisible(page, step, candidates, timeoutMs) {
  const selector = await firstVisible(page, candidates, timeoutMs);
  if (!selector) {
    throw new Error(
      `Surfshark popup step "${step}" timed out after ${Math.round(
        timeoutMs / 1000,
      )}s. Tried: ${candidates.join(" , ")}. ` +
        `Update native-host/vpn/surfshark.selectors.local.json if the popup layout changed.`,
    );
  }
  return page.locator(selector).first();
}

async function openPopup(context, extensionId, candidatePaths, anchors) {
  const tried = [];
  const page = await context.newPage();

  for (const candidate of candidatePaths) {
    const url = `chrome-extension://${extensionId}/${String(candidate).replace(
      /^\/+/,
      "",
    )}`;
    tried.push(url);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    } catch {
      continue;
    }

    if (await firstVisible(page, anchors, 8000)) {
      return { page, url };
    }
  }

  await page.close().catch(() => {});
  throw new Error(
    `Could not open a usable Surfshark popup. Tried: ${tried.join(" , ")}.`,
  );
}

async function signIn(page, steps, username, password, onProgress) {
  const emailSelector = await firstVisible(page, steps.emailInput, 2000);
  if (!emailSelector) {
    onProgress?.("Surfshark session already signed in.");
    return false;
  }

  onProgress?.("Signing in to Surfshark…");
  await page.locator(emailSelector).first().fill(username);

  const passwordField = await requireVisible(
    page,
    "passwordInput",
    steps.passwordInput,
    15_000,
  );
  await passwordField.fill(password);

  const submit = await requireVisible(
    page,
    "submitLogin",
    steps.submitLogin,
    15_000,
  );
  await submit.click();

  const signedIn = await firstVisible(page, steps.signedInIndicator, 60_000);
  if (!signedIn) {
    const failure = await firstVisible(page, steps.loginError, 1000);
    throw new Error(
      failure
        ? "Surfshark rejected the sign-in. Check the account email and password, and whether the account needs a one-time code."
        : "Surfshark sign-in did not complete within 60s. The popup may be showing a CAPTCHA, a device prompt, or an onboarding screen that needs a one-time manual pass.",
    );
  }

  return true;
}

async function selectCountry(page, steps, country, onProgress) {
  const openLocations = await firstVisible(page, steps.openLocations, 8000);
  if (openLocations) {
    await page.locator(openLocations).first().click();
  }

  const search = await firstVisible(page, steps.locationSearch, 4000);
  if (search) {
    await page.locator(search).first().fill(country.label);
  }

  onProgress?.(`Selecting ${country.name}…`);
  const option = await requireVisible(
    page,
    "countryOption",
    fill(steps.countryOption, country.label),
    20_000,
  );
  await option.click();
}

/**
 * Signs in if needed, pins the profile to one country, and waits for the
 * extension to report a live connection.
 *
 * @returns {Promise<{extensionId: string, extensionIdSource: string, popupUrl: string}>}
 */
export async function connectSurfshark(options) {
  const {
    context,
    extensionPath,
    username,
    password,
    country,
    onProgress,
    connectTimeoutMs = 120_000,
  } = options;

  const selectors = await loadSelectors();
  const steps = selectors.steps;
  const manifest = await readExtensionManifest(extensionPath);

  const { id: extensionId, source: extensionIdSource } =
    await resolveExtensionId(context, manifest, extensionPath);

  const declaredPopup =
    manifest?.action?.default_popup || manifest?.browser_action?.default_popup;
  const candidatePaths = [
    ...(declaredPopup ? [declaredPopup] : []),
    ...selectors.popupPaths,
  ].filter((value, index, all) => all.indexOf(value) === index);

  const anchors = [...steps.signedInIndicator, ...steps.emailInput];
  const { page, url } = await openPopup(
    context,
    extensionId,
    candidatePaths,
    anchors,
  );

  try {
    await signIn(page, steps, username, password, onProgress);
    await selectCountry(page, steps, country, onProgress);

    const connectButton = await firstVisible(page, steps.connectButton, 5000);
    if (connectButton) {
      await page.locator(connectButton).first().click();
    }

    onProgress?.(`Waiting for the ${country.name} tunnel…`);
    const connected = await firstVisible(
      page,
      steps.connectedIndicator,
      connectTimeoutMs,
    );
    if (!connected) {
      const failure = await firstVisible(page, steps.connectionError, 1000);
      throw new Error(
        failure
          ? `Surfshark reported a connection error for ${country.name}.`
          : `Surfshark did not report a connection to ${country.name} within ${Math.round(
              connectTimeoutMs / 1000,
            )}s.`,
      );
    }

    return { extensionId, extensionIdSource, popupUrl: url };
  } finally {
    await page.close().catch(() => {});
  }
}
