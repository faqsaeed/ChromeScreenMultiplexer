import { COUNTRY_CATALOGUE } from "./native-host/countries.js";

const MAX_ACTIVE_SESSIONS = 20;

const form = document.querySelector("#launcher-form");
const targetUrlInput = document.querySelector("#target-url");
const countInput = document.querySelector("#session-count");
const environmentsInput = document.querySelector("#environments");
const proxiesInput = document.querySelector("#proxies");
const proxyField = document.querySelector("#proxy-field");
const directModeInput = document.querySelector("#direct-mode");
const authorizedInput = document.querySelector("#authorized");
const launchButton = form.querySelector('button[type="submit"]');
const stopButton = document.querySelector("#stop-all");
const generateEnvironmentsButton = document.querySelector(
  "#generate-environments",
);
const statusCard = document.querySelector("#status-card");
const statusText = document.querySelector("#status-text");

const vpnEnabledInput = document.querySelector("#vpn-enabled");
const vpnDetails = document.querySelector("#vpn-details");
const vpnPathInput = document.querySelector("#vpn-extension-path");
const vpnUsernameInput = document.querySelector("#vpn-username");
const vpnPasswordInput = document.querySelector("#vpn-password");
const countryGrid = document.querySelector("#country-grid");
const countryCounter = document.querySelector("#country-counter");
const autoPickButton = document.querySelector("#auto-pick");
const clearCountriesButton = document.querySelector("#clear-countries");

const dashboardEnabledInput = document.querySelector("#dashboard-enabled");
const dashboardCornerInput = document.querySelector("#dashboard-corner");
const dashboardRefreshInput = document.querySelector("#dashboard-refresh");

const fleetSummary = document.querySelector("#fleet-summary");
const fleetCounts = document.querySelector("#fleet-counts");
const fleetList = document.querySelector("#fleet-list");

const selectedCountries = new Set();

const ENVIRONMENT_PRESETS = [
  "1366x768 | en-US | America/New_York",
  "1440x900 | en-GB | Europe/London",
  "1536x864 | en-SG | Asia/Singapore",
  "1280x720 | en-CA | America/Toronto",
  "1600x900 | en-AU | Australia/Sydney",
  "1920x1080 | en-US | America/Chicago",
  "1280x800 | de-DE | Europe/Berlin",
  "1680x1050 | fr-FR | Europe/Paris",
  "1024x768 | es-ES | Europe/Madrid",
  "1280x1024 | it-IT | Europe/Rome",
  "1440x960 | ja-JP | Asia/Tokyo",
  "1600x1000 | ko-KR | Asia/Seoul",
  "1360x768 | pt-BR | America/Sao_Paulo",
  "1470x956 | en-NZ | Pacific/Auckland",
  "1512x982 | nl-NL | Europe/Amsterdam",
  "1728x1117 | sv-SE | Europe/Stockholm",
  "1920x1200 | pl-PL | Europe/Warsaw",
  "2048x1152 | en-IN | Asia/Kolkata",
  "2560x1440 | ar-AE | Asia/Dubai",
  "3840x2160 | en-ZA | Africa/Johannesburg",
];

const STATE_LABELS = {
  queued: "queued",
  launching: "launching",
  "vpn-signin": "VPN sign-in",
  "vpn-connecting": "VPN connecting",
  "vpn-connected": "VPN ready",
  "ip-check": "IP check",
  navigating: "loading",
  running: "running",
  failed: "failed",
  closed: "closed",
};

function nonEmptyLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnvironments(value) {
  return nonEmptyLines(value).map((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length !== 3) {
      throw new Error(
        `Environment ${index + 1} must use: widthxheight | locale | timezone`,
      );
    }

    const dimensions = parts[0].match(/^(\d{3,4})\s*[x×]\s*(\d{3,4})$/i);
    if (!dimensions) {
      throw new Error(`Environment ${index + 1} has invalid dimensions.`);
    }

    return {
      width: Number(dimensions[1]),
      height: Number(dimensions[2]),
      locale: parts[1],
      timezoneId: parts[2],
    };
  });
}

function requiredCountryCount() {
  const count = Number.parseInt(countInput.value, 10) || 1;
  return Math.min(count, MAX_ACTIVE_SESSIONS);
}

function showStatus(status) {
  const kind = status?.kind || "idle";
  statusCard.className = `status ${kind}`;
  statusText.textContent = status?.message || "Ready.";
  launchButton.disabled = kind === "working";
}

/* ------------------------------------------------------------------ *
 * Country pool
 * ------------------------------------------------------------------ */

function renderCountryGrid() {
  countryGrid.replaceChildren(
    ...COUNTRY_CATALOGUE.map((country) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.code = country.code;
      chip.textContent = country.code;
      chip.title = country.name;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        if (selectedCountries.has(country.code)) {
          selectedCountries.delete(country.code);
        } else {
          selectedCountries.add(country.code);
        }
        syncCountrySelection();
      });
      return chip;
    }),
  );
}

function syncCountrySelection() {
  for (const chip of countryGrid.children) {
    const on = selectedCountries.has(chip.dataset.code);
    chip.classList.toggle("selected", on);
    chip.setAttribute("aria-pressed", String(on));
  }

  const needed = requiredCountryCount();
  const short = selectedCountries.size < needed;
  countryCounter.textContent = `${selectedCountries.size} selected · ${needed} needed`;
  countryCounter.classList.toggle("short", short && vpnEnabledInput.checked);
}

function autoPickCountries() {
  const needed = requiredCountryCount();
  for (const country of COUNTRY_CATALOGUE) {
    if (selectedCountries.size >= needed) {
      break;
    }
    selectedCountries.add(country.code);
  }
  syncCountrySelection();
}

/* ------------------------------------------------------------------ *
 * Mode wiring
 * ------------------------------------------------------------------ */

function syncModes() {
  const vpnMode = vpnEnabledInput.checked;

  if (vpnMode) {
    // VPN routing happens inside the profile, so Playwright must connect
    // directly; stacking an IPRoyal proxy on top would double-route.
    directModeInput.checked = true;
  }
  directModeInput.disabled = vpnMode;

  const directMode = directModeInput.checked;
  proxiesInput.disabled = directMode;
  proxiesInput.required = !directMode;
  proxyField.classList.toggle("disabled", directMode);

  vpnDetails.hidden = !vpnMode;
  vpnPathInput.required = vpnMode;
  vpnUsernameInput.required = vpnMode;
  vpnPasswordInput.required = vpnMode;

  syncCountrySelection();
}

/* ------------------------------------------------------------------ *
 * Live fleet summary
 * ------------------------------------------------------------------ */

function renderFleet(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.sessions) || snapshot.sessions.length === 0) {
    fleetSummary.hidden = true;
    return;
  }

  fleetSummary.hidden = false;
  const run = snapshot.run || {};
  fleetCounts.textContent = `${run.active ?? 0} active · ${run.queued ?? 0} queued${
    run.failed ? ` · ${run.failed} failed` : ""
  }`;

  fleetList.replaceChildren(
    ...snapshot.sessions.map((session) => {
      const item = document.createElement("li");
      item.className = `fleet-row ${session.state}`;

      const label = session.country ? session.country.code : "··";
      const detail = [
        STATE_LABELS[session.state] || session.state,
        session.ip,
        Number.isFinite(session.rssBytes)
          ? `${Math.round(session.rssBytes / 1024 / 1024)} MB`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      item.innerHTML =
        `<span class="fleet-index">${session.index}</span>` +
        `<span class="fleet-cc">${label}</span>` +
        `<span class="fleet-detail"></span>`;
      item.querySelector(".fleet-detail").textContent = detail;
      return item;
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

async function restorePreferences() {
  renderCountryGrid();

  const [{ preferences }, state, fleet] = await Promise.all([
    chrome.storage.local.get("preferences"),
    chrome.runtime.sendMessage({ type: "launcher.getState" }),
    chrome.runtime.sendMessage({ type: "launcher.getFleet" }),
  ]);

  if (preferences) {
    targetUrlInput.value = preferences.targetUrl || targetUrlInput.value;
    countInput.value = preferences.count || countInput.value;
    environmentsInput.value =
      preferences.environmentsText || environmentsInput.value;
    directModeInput.checked = preferences.directMode === true;
    vpnEnabledInput.checked = preferences.vpnEnabled === true;
    vpnPathInput.value = preferences.vpnExtensionPath || "";
    vpnUsernameInput.value = preferences.vpnUsername || "";
    dashboardEnabledInput.checked = preferences.dashboardEnabled !== false;
    dashboardCornerInput.value = preferences.dashboardCorner || "bottom-right";
    dashboardRefreshInput.value = preferences.dashboardRefreshMs || 4000;

    for (const code of preferences.countries || []) {
      selectedCountries.add(code);
    }
  }

  syncModes();

  if (state?.ok) {
    showStatus(state.status);
  }
  if (fleet?.ok) {
    renderFleet(fleet.snapshot);
  }
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const targetUrl = new URL(targetUrlInput.value);
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      throw new Error("Target URL must start with http:// or https://.");
    }

    const count = Number(countInput.value);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error("Session count must be between 1 and 100.");
    }

    const environments = parseEnvironments(environmentsInput.value);
    const vpnEnabled = vpnEnabledInput.checked;
    const directMode = vpnEnabled || directModeInput.checked;
    const proxyLines = directMode ? [] : nonEmptyLines(proxiesInput.value);

    if (environments.length !== count) {
      throw new Error(`Enter exactly ${count} test environment rows.`);
    }
    if (!directMode && proxyLines.length !== count) {
      throw new Error(`Enter exactly ${count} IPRoyal proxy rows.`);
    }
    if (!directMode && new Set(proxyLines).size !== proxyLines.length) {
      throw new Error("Every proxy row must be unique.");
    }
    const dimensions = environments.map(
      ({ width, height }) => `${width}x${height}`,
    );
    if (new Set(dimensions).size !== dimensions.length) {
      throw new Error("Every session must use different screen dimensions.");
    }

    const countries = [...selectedCountries];
    let vpn;
    if (vpnEnabled) {
      const needed = Math.min(count, MAX_ACTIVE_SESSIONS);
      if (!vpnPathInput.value.trim()) {
        throw new Error("Enter the unpacked Surfshark extension folder.");
      }
      if (!vpnUsernameInput.value.trim() || !vpnPasswordInput.value) {
        throw new Error("Enter the Surfshark account email and password.");
      }
      if (countries.length < needed) {
        throw new Error(
          `Select at least ${needed} countries so every open profile gets a unique one. ${countries.length} selected.`,
        );
      }

      vpn = {
        enabled: true,
        provider: "surfshark",
        extensionPath: vpnPathInput.value.trim(),
        username: vpnUsernameInput.value.trim(),
        password: vpnPasswordInput.value,
        countries,
      };
    }

    if (!authorizedInput.checked) {
      throw new Error("Confirm that the target is authorized for testing.");
    }

    await chrome.storage.local.set({
      preferences: {
        targetUrl: targetUrl.href,
        count,
        environmentsText: environmentsInput.value,
        directMode: directModeInput.checked,
        vpnEnabled,
        vpnExtensionPath: vpnPathInput.value.trim(),
        vpnUsername: vpnUsernameInput.value.trim(),
        countries,
        dashboardEnabled: dashboardEnabledInput.checked,
        dashboardCorner: dashboardCornerInput.value,
        dashboardRefreshMs: Number(dashboardRefreshInput.value) || 4000,
      },
    });

    showStatus({ kind: "working", message: "Sending launch request…" });
    const response = await chrome.runtime.sendMessage({
      type: "launcher.launch",
      payload: {
        targetUrl: targetUrl.href,
        count,
        environments,
        proxyLines,
        directMode,
        vpn,
        dashboard: {
          enabled: dashboardEnabledInput.checked,
          corner: dashboardCornerInput.value,
          refreshMs: Number(dashboardRefreshInput.value) || 4000,
        },
        authorized: true,
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || "The launch request failed.");
    }

    proxiesInput.value = "";
    vpnPasswordInput.value = "";
  } catch (error) {
    showStatus({ kind: "error", message: error.message });
  }
});

generateEnvironmentsButton.addEventListener("click", () => {
  const count = Math.max(
    1,
    Math.min(100, Number.parseInt(countInput.value, 10) || 1),
  );
  countInput.value = String(count);

  const generated = [];
  for (let i = 0; i < count; i++) {
    if (i < ENVIRONMENT_PRESETS.length) {
      generated.push(ENVIRONMENT_PRESETS[i]);
    } else {
      const width = 1000 + i * 10;
      const height = 700 + i * 5;
      generated.push(`${width}x${height} | en-US | America/New_York`);
    }
  }
  environmentsInput.value = generated.join("\n");
  syncCountrySelection();
});

autoPickButton.addEventListener("click", autoPickCountries);
clearCountriesButton.addEventListener("click", () => {
  selectedCountries.clear();
  syncCountrySelection();
});
countInput.addEventListener("input", syncCountrySelection);
vpnEnabledInput.addEventListener("change", syncModes);
directModeInput.addEventListener("change", syncModes);

stopButton.addEventListener("click", async () => {
  try {
    showStatus({ kind: "working", message: "Stopping test sessions…" });
    const response = await chrome.runtime.sendMessage({ type: "launcher.stop" });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to stop test sessions.");
    }
    fleetSummary.hidden = true;
  } catch (error) {
    showStatus({ kind: "error", message: error.message });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "launcher.status") {
    showStatus(message.status);
  }
  if (message?.type === "launcher.fleet") {
    renderFleet(message.snapshot);
  }
});

void restorePreferences().catch((error) => {
  showStatus({ kind: "error", message: error.message });
});
