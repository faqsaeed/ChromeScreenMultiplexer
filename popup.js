import {
  COUNTRY_CATALOGUE,
  personaForCountry,
} from "./native-host/countries.js";

const MAX_ACTIVE_SESSIONS = 20;

const form = document.querySelector("#launcher-form");
const targetUrlInput = document.querySelector("#target-url");
const countInput = document.querySelector("#session-count");
const activeLimitInput = document.querySelector("#active-limit");
const queueModeInput = document.querySelector("#queue-mode");
const queueCount = document.querySelector("#queue-count");
const environmentsInput = document.querySelector("#environments");
const directModeInput = document.querySelector("#direct-mode");
const authorizedInput = document.querySelector("#authorized");
const launchButton = document.querySelector("#launch-sessions");
const prepareButton = document.querySelector("#prepare-profiles");
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
const personaPreview = document.querySelector("#persona-preview");

const dashboardEnabledInput = document.querySelector("#dashboard-enabled");
const dashboardCornerInput = document.querySelector("#dashboard-corner");
const dashboardRefreshInput = document.querySelector("#dashboard-refresh");

const fleetSummary = document.querySelector("#fleet-summary");
const fleetCounts = document.querySelector("#fleet-counts");
const fleetList = document.querySelector("#fleet-list");

const selectedCountries = new Set();

const STATE_LABELS = {
  queued: "queued",
  launching: "launching",
  "vpn-signin": "VPN sign-in",
  "vpn-connecting": "VPN connecting",
  "vpn-connected": "VPN ready",
  "ip-check": "IP check",
  navigating: "loading",
  running: "running",
  setup: "manual VPN setup",
  attention: "needs attention",
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
  return count;
}

function chosenCountries() {
  return COUNTRY_CATALOGUE.filter((country) => selectedCountries.has(country.code));
}

function syncQueueCounts() {
  const count = Math.max(1, Number.parseInt(countInput.value, 10) || 1);
  const maximum = Math.min(count, MAX_ACTIVE_SESSIONS);
  activeLimitInput.max = String(maximum);
  const active = Math.max(
    1,
    Math.min(maximum, Number.parseInt(activeLimitInput.value, 10) || maximum),
  );
  activeLimitInput.value = String(active);
  queueCount.textContent = `${Math.max(0, count - active)} queued`;
}

function showStatus(status) {
  const kind = status?.kind || "idle";
  statusCard.className = `status ${kind}`;
  statusText.textContent = status?.message || "Ready.";
  launchButton.disabled = kind === "working";
  prepareButton.disabled = kind === "working";
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
  personaPreview.replaceChildren(
    ...chosenCountries().slice(0, needed).map((country, index) => {
      const persona = personaForCountry(country.code, index);
      const item = document.createElement("li");
      item.textContent = `Profile ${index + 1}: ${country.name} · ${persona.locale} · ${persona.timezoneId} · ${persona.width}×${persona.height}`;
      return item;
    }),
  );
  syncQueueCounts();
}

function autoPickCountries() {
  const needed = requiredCountryCount();
  selectedCountries.clear();
  for (const country of COUNTRY_CATALOGUE) {
    if (selectedCountries.size >= needed) {
      break;
    }
    selectedCountries.add(country.code);
  }
  syncCountrySelection();
}

function generatePersonaRows() {
  const count = Math.max(
    1,
    Math.min(COUNTRY_CATALOGUE.length, Number.parseInt(countInput.value, 10) || 1),
  );
  countInput.value = String(count);
  if (selectedCountries.size < count) {
    autoPickCountries();
  }
  const selected = chosenCountries().slice(0, count);
  environmentsInput.value = selected
    .map((country, index) => {
      const persona = personaForCountry(country.code, index);
      return `${persona.width}x${persona.height} | ${persona.locale} | ${persona.timezoneId}`;
    })
    .join("\n");
  syncCountrySelection();
}

/* ------------------------------------------------------------------ *
 * Mode wiring
 * ------------------------------------------------------------------ */

function syncModes() {
  const vpnMode = vpnEnabledInput.checked;

  // Surfshark routes inside the profile. With Surfshark off, the supported
  // fallback is a direct dry run; the old paid-per-GB proxy UI is retired.
  directModeInput.checked = true;
  directModeInput.disabled = true;

  vpnDetails.hidden = !vpnMode;
  vpnPathInput.required = false;
  vpnUsernameInput.required = false;
  vpnPasswordInput.required = false;

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
      item.className = `fleet-row ${
        session.vpnCheck === "connected" ? "running" : session.state
      }`;

      const label = session.country ? session.country.code : "··";
      const detail = [
        session.vpnCheck === "connected"
          ? "VPN connected"
          : STATE_LABELS[session.state] || session.state,
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
    activeLimitInput.value = preferences.activeLimit || activeLimitInput.value;
    queueModeInput.value = preferences.queueMode || "manual";
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
  } else {
    autoPickCountries();
    generatePersonaRows();
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
  const prepareOnly = event.submitter?.id === "prepare-profiles";

  try {
    const targetUrl = new URL(targetUrlInput.value);
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      throw new Error("Target URL must start with http:// or https://.");
    }

    const count = Number(countInput.value);
    if (!Number.isInteger(count) || count < 1 || count > COUNTRY_CATALOGUE.length) {
      throw new Error(`Persistent profile count must be between 1 and ${COUNTRY_CATALOGUE.length}.`);
    }

    const activeLimit = Number(activeLimitInput.value);
    if (
      !Number.isInteger(activeLimit) ||
      activeLimit < 1 ||
      activeLimit > Math.min(count, MAX_ACTIVE_SESSIONS)
    ) {
      throw new Error(`Open initially must be between 1 and ${Math.min(count, MAX_ACTIVE_SESSIONS)}.`);
    }

    if (prepareOnly) {
      vpnEnabledInput.checked = true;
      vpnPathInput.value = "";
      syncModes();
      if (selectedCountries.size < count) {
        autoPickCountries();
      }
      generatePersonaRows();
    }

    const environments = parseEnvironments(environmentsInput.value);
    const vpnEnabled = vpnEnabledInput.checked;
    const directMode = vpnEnabled || directModeInput.checked;
    const proxyLines = [];

    if (environments.length !== count) {
      throw new Error(`Enter exactly ${count} test environment rows.`);
    }
    const dimensions = environments.map(
      ({ width, height }) => `${width}x${height}`,
    );
    if (new Set(dimensions).size !== dimensions.length) {
      throw new Error("Every session must use different screen dimensions.");
    }

    const countries = chosenCountries()
      .slice(0, count)
      .map((country) => country.code);
    let vpn;
    if (vpnEnabled) {
      const needed = count;
      if (Boolean(vpnUsernameInput.value.trim()) !== Boolean(vpnPasswordInput.value)) {
        throw new Error("Provide both the Surfshark email and password, or leave both blank to use saved logins.");
      }
      if (countries.length < needed) {
        throw new Error(
          `Select ${needed} countries so every persistent profile has a fixed persona. ${countries.length} selected.`,
        );
      }

      vpn = {
        enabled: true,
        provider: "surfshark",
        extensionPath: prepareOnly ? "" : vpnPathInput.value.trim(),
        username: vpnUsernameInput.value.trim(),
        password: vpnPasswordInput.value,
        countries,
      };
    }
    if (prepareOnly && !vpnEnabled) {
      throw new Error("Prepare profiles is available in Surfshark VPN mode.");
    }

    if (!authorizedInput.checked) {
      throw new Error("Confirm that the target is authorized for testing.");
    }

    await chrome.storage.local.set({
      preferences: {
        targetUrl: targetUrl.href,
        count,
        activeLimit,
        queueMode: queueModeInput.value,
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

    showStatus({
      kind: "working",
      message: prepareOnly
        ? "Opening persistent profiles for one-time Surfshark setup…"
        : "Sending launch request…",
    });
    const response = await chrome.runtime.sendMessage({
      type: "launcher.launch",
      payload: {
        targetUrl: targetUrl.href,
        count,
        activeLimit,
        queueMode: queueModeInput.value,
        prepareOnly,
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

    vpnPasswordInput.value = "";
  } catch (error) {
    showStatus({ kind: "error", message: error.message });
  }
});

generateEnvironmentsButton.addEventListener("click", generatePersonaRows);

autoPickButton.addEventListener("click", autoPickCountries);
clearCountriesButton.addEventListener("click", () => {
  selectedCountries.clear();
  syncCountrySelection();
});
countInput.addEventListener("input", () => {
  syncCountrySelection();
  syncQueueCounts();
});
activeLimitInput.addEventListener("input", syncQueueCounts);
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
