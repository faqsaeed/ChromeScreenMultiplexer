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

function showStatus(status) {
  const kind = status?.kind || "idle";
  statusCard.className = `status ${kind}`;
  statusText.textContent = status?.message || "Ready.";
  launchButton.disabled = kind === "working";
}

function syncDirectMode() {
  const directMode = directModeInput.checked;
  proxiesInput.disabled = directMode;
  proxiesInput.required = !directMode;
  proxyField.classList.toggle("disabled", directMode);
}

async function restorePreferences() {
  const [{ preferences }, state] = await Promise.all([
    chrome.storage.local.get("preferences"),
    chrome.runtime.sendMessage({ type: "launcher.getState" }),
  ]);

  if (preferences) {
    targetUrlInput.value = preferences.targetUrl || targetUrlInput.value;
    countInput.value = preferences.count || countInput.value;
    environmentsInput.value =
      preferences.environmentsText || environmentsInput.value;
    directModeInput.checked = preferences.directMode === true;
  }

  syncDirectMode();

  if (state?.ok) {
    showStatus(state.status);
  }
}

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
    const directMode = directModeInput.checked;
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
    if (!authorizedInput.checked) {
      throw new Error("Confirm that the target is authorized for testing.");
    }

    await chrome.storage.local.set({
      preferences: {
        targetUrl: targetUrl.href,
        count,
        environmentsText: environmentsInput.value,
        directMode,
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
        authorized: true,
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || "The launch request failed.");
    }

    proxiesInput.value = "";
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
});

directModeInput.addEventListener("change", syncDirectMode);

stopButton.addEventListener("click", async () => {
  try {
    showStatus({ kind: "working", message: "Stopping test sessions…" });
    const response = await chrome.runtime.sendMessage({ type: "launcher.stop" });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to stop test sessions.");
    }
  } catch (error) {
    showStatus({ kind: "error", message: error.message });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "launcher.status") {
    showStatus(message.status);
  }
});

void restorePreferences().catch((error) => {
  showStatus({ kind: "error", message: error.message });
});
