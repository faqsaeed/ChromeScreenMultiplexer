const NATIVE_HOST_NAME = "com.local.chrome_qa_launcher";

let nativePort = null;
let lastFleet = null;
let lastStatus = {
  kind: "idle",
  message: "Ready to launch authorized test sessions.",
};

async function publishStatus(status) {
  lastStatus = {
    ...status,
    updatedAt: new Date().toISOString(),
  };

  await chrome.storage.local.set({ launcherStatus: lastStatus });
  chrome.runtime
    .sendMessage({ type: "launcher.status", status: lastStatus })
    .catch(() => {});
}

async function publishFleet(snapshot) {
  lastFleet = snapshot;
  await chrome.storage.local.set({ fleetSnapshot: snapshot });
  chrome.runtime
    .sendMessage({ type: "launcher.fleet", snapshot })
    .catch(() => {});
}

function describeMode(message) {
  if (message.vpnEnabled) {
    return "Surfshark VPN";
  }
  return message.directMode ? "direct dry-run" : "proxied";
}

function describeNativeMessage(message) {
  switch (message.type) {
    case "ready":
      return {
        kind: "ready",
        message: "Local launcher connected.",
      };
    case "accepted":
      return {
        kind: "working",
        message: `Launching ${message.count} authorized test session${
          message.count === 1 ? "" : "s"
        } in ${describeMode(message)} mode, with up to ${
          message.maxActive
        } active at once…`,
      };
    case "progress":
      return {
        kind: "working",
        message: message.message,
      };
    case "complete":
      return {
        kind: message.failed === 0 ? "success" : "warning",
        message: `Launch finished: ${message.launched} opened, ${message.failed} failed.`,
      };
    case "stopped":
      return {
        kind: "idle",
        message: `Stopped ${message.count} test session${
          message.count === 1 ? "" : "s"
        }${message.cancelled ? ` and cancelled ${message.cancelled} queued` : ""}.`,
      };
    case "state":
      return {
        kind: message.launching ? "working" : message.active > 0 ? "success" : "idle",
        message: `${message.active} active test session${
          message.active === 1 ? "" : "s"
        }${message.queued ? `, ${message.queued} queued` : ""}${
          message.launching && !message.queued ? " (launching)" : ""
        }.`,
      };
    case "error":
      return {
        kind: "error",
        message: message.message || "The local launcher reported an error.",
      };
    default:
      return {
        kind: "warning",
        message: "The local launcher sent an unknown status.",
      };
  }
}

function connectNativeHost() {
  if (nativePort) {
    return nativePort;
  }

  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  nativePort = port;

  port.onMessage.addListener((message) => {
    // Telemetry arrives on a timer and must not overwrite the launch status.
    if (message?.type === "fleet") {
      void publishFleet(message.snapshot);
      return;
    }
    void publishStatus(describeNativeMessage(message));
  });

  port.onDisconnect.addListener(() => {
    if (nativePort !== port) {
      return;
    }

    const reason =
      chrome.runtime.lastError?.message ||
      "The local launcher disconnected. Run the setup script and reload the extension.";
    nativePort = null;
    void publishStatus({ kind: "error", message: reason });
  });

  return port;
}

chrome.runtime.onInstalled.addListener(() => {
  void publishStatus(lastStatus);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "launcher.getState") {
    chrome.storage.local
      .get("launcherStatus")
      .then(({ launcherStatus }) => {
        sendResponse({ ok: true, status: launcherStatus || lastStatus });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "launcher.getFleet") {
    chrome.storage.local
      .get("fleetSnapshot")
      .then(({ fleetSnapshot }) => {
        sendResponse({ ok: true, snapshot: fleetSnapshot || lastFleet });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "launcher.launch") {
    if (message.payload?.authorized !== true) {
      sendResponse({
        ok: false,
        error: "Authorization confirmation is required.",
      });
      return false;
    }

    try {
      const port = connectNativeHost();
      void publishStatus({
        kind: "working",
        message: "Connecting to the local launcher…",
      });
      port.postMessage({ action: "launch", payload: message.payload });
      sendResponse({ ok: true });
    } catch (error) {
      void publishStatus({ kind: "error", message: error.message });
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  if (message?.type === "launcher.stop") {
    try {
      const port = connectNativeHost();
      port.postMessage({ action: "stopAll" });
      sendResponse({ ok: true });
    } catch (error) {
      void publishStatus({ kind: "error", message: error.message });
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  if (message?.type === "launcher.refresh") {
    try {
      const port = connectNativeHost();
      port.postMessage({ action: "getState" });
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  return false;
});
