import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_FILE = path.join(moduleDir, "dashboard", "index.html");
const DASHBOARD_TITLE = "Chrome QA Fleet Monitor";
const WIDTH = 470;
const HEIGHT = 660;
const MARGIN = 14;

/**
 * Chrome cannot make its own window topmost, so on Windows we ask user32 to do
 * it. Elsewhere the window is corner-positioned but stays in the normal
 * stacking order.
 */
function pinTopmostOnWindows() {
  if (process.platform !== "win32") {
    return Promise.resolve(false);
  }

  const script = `
$signature = @'
[DllImport("user32.dll")]
public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
'@
$user32 = Add-Type -MemberDefinition $signature -Name 'QaLauncherWin32' -Namespace 'Native' -PassThru
$pinned = 0
Get-Process -Name chrome -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like '*${DASHBOARD_TITLE}*' } |
  ForEach-Object {
    [void]$user32::SetWindowPos($_.MainWindowHandle, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0003)
    $pinned++
  }
Write-Output $pinned
`;

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { timeout: 10_000 },
      (error, stdout) => {
        resolve(!error && Number(String(stdout).trim()) > 0);
      },
    );
  });
}

function cornerBounds(corner, screen) {
  const left = corner.endsWith("left")
    ? screen.availLeft + MARGIN
    : screen.availLeft + screen.availWidth - WIDTH - MARGIN;
  const top = corner.startsWith("top")
    ? screen.availTop + MARGIN
    : screen.availTop + screen.availHeight - HEIGHT - MARGIN;

  return {
    left: Math.max(0, Math.round(left)),
    top: Math.max(0, Math.round(top)),
    width: WIDTH,
    height: HEIGHT,
  };
}

async function findDashboardPage(context, targetUrl) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      if (page.url().startsWith(targetUrl)) {
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

/**
 * Opens the always-visible fleet monitor in its own Chrome window, pinned to a
 * screen corner.
 *
 * @returns {Promise<{push: Function, close: Function, isAlive: Function, pinned: boolean}>}
 */
export async function openFleetDashboard(options) {
  const corner = options.corner || "bottom-right";
  const profileDir = options.profileDir;
  const dashboardUrl = pathToFileURL(DASHBOARD_FILE).href;

  await fs.mkdir(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: [
      `--app=${dashboardUrl}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const page = await findDashboardPage(context, dashboardUrl);
  if (!page) {
    await context.close().catch(() => {});
    throw new Error("The fleet dashboard window did not open.");
  }

  // --app opens the monitor in its own window; Chrome may also restore a blank
  // tab alongside it.
  await Promise.all(
    context
      .pages()
      .filter((other) => other !== page)
      .map((other) => other.close().catch(() => {})),
  );

  await page
    .waitForFunction(() => window.__fleetReady === true, null, {
      timeout: 15_000,
    })
    .catch(() => {});

  let alive = true;
  page.on("close", () => {
    alive = false;
  });
  context.on("close", () => {
    alive = false;
  });

  try {
    const screen = await page.evaluate(() => ({
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      availLeft: window.screen.availLeft || 0,
      availTop: window.screen.availTop || 0,
    }));

    const cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "normal", ...cornerBounds(corner, screen) },
    });
    await cdp.detach().catch(() => {});
  } catch {
    // Positioning is cosmetic; a dashboard in the wrong corner still works.
  }

  const pinned = await pinTopmostOnWindows();

  return {
    pinned,
    isAlive: () => alive,
    async push(snapshot) {
      if (!alive) {
        return false;
      }
      try {
        await page.evaluate((data) => window.__fleetUpdate(data), snapshot);
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      alive = false;
      await context.close().catch(() => {});
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
