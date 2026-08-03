# ChromeScreenMultiplexer

This project launches separate, visible Chrome processes for authorized browser
compatibility and regional QA. Each process receives:

- its own temporary Chrome profile and browser storage;
- one explicit route to the internet — either an HTTP/HTTPS/SOCKS5 proxy or a
  Surfshark VPN country no other running profile holds;
- one viewport and emulated screen size;
- one locale and timezone configuration; and
- the same user-supplied test URL.

It consists of a Manifest V3 Chrome extension and a local Node.js native-messaging
companion. The companion is necessary because Chrome's extension proxy setting is
profile-scoped: an extension alone cannot assign an independent authenticated proxy
to every normal browser window.

## Safety scope

Use this only on a site you own or have written permission to test. It does not
automate accounts, clicks, engagement, CAPTCHAs, or access-control bypasses. It is
not an anti-detect browser and does not make sessions represent different people.

The launcher accepts up to 100 test configurations and keeps at most 20 Chrome
processes active simultaneously. Extra configurations remain queued; closing an
active test window opens the next one. Proxy and VPN credentials are sent only to
the local native companion and are not saved by the extension. Temporary profiles
are removed when sessions close or when **Stop all** is used, on a best-effort
basis.

## Requirements

- Windows 10/11, macOS, or Linux
- Google Chrome
- Node.js 20 or newer
- For proxy mode: one unique IPRoyal proxy configuration per test session
- For VPN mode: a Surfshark account and the unpacked Surfshark Chrome extension

For IPRoyal Residential, generate a sticky proxy list in the dashboard using:

```text
host:port:username:password
```

Use a distinct sticky session identifier in each row. A unique configuration does
not itself guarantee that the provider assigned a unique exit IP.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this project directory.
4. Copy the extension's 32-character ID shown by Chrome.
5. Run the setup script for your platform from the project root:

   **Windows (PowerShell)**

   ```powershell
   .\setup-windows.ps1 YOUR_EXTENSION_ID
   ```

   **macOS**

   ```sh
   chmod +x setup-macos.sh
   ./setup-macos.sh YOUR_EXTENSION_ID
   ```

6. Return to `chrome://extensions` and reload the extension.

Setup installs `playwright-core` locally and registers
`com.local.chrome_qa_launcher` as a native-messaging host for that exact extension
ID — through a manifest file plus an `HKCU\Software\Google\Chrome\NativeMessagingHosts`
registry entry on Windows, or a manifest in Chrome's `NativeMessagingHosts`
directory on macOS and Linux. It does not install another browser; it launches the
Google Chrome already on the machine. Setup records the exact Node.js executable
path so Chrome does not have to discover Homebrew, `nvm`, or a PATH entry from its
restricted environment.

## Use

1. Open the extension.
2. Enter the owned or authorized test URL.
3. Choose a session count from 1 to 100. Use **Generate rows for session count**
   if you want a complete starter environment matrix.
4. Enter exactly one environment row per session:

   ```text
   1366x768 | en-US | America/New_York
   1440x900 | en-GB | Europe/London
   1536x864 | en-SG | Asia/Singapore
   ```

5. Choose a routing mode: paste one unique IPRoyal proxy row per session, enable
   **Direct-connection dry run**, or enable **Surfshark VPN per profile**.
6. Confirm authorization and select **Launch sessions**.
7. Up to 20 processes open initially. If more configurations are queued, closing
   one active Chrome window opens the next.
8. Use **Stop all** to close the launched processes, cancel the queue, close the
   fleet monitor, and remove temporary profiles.

## Fleet monitor

Enable **Open the live stats window** to get a compact Chrome window pinned to a
screen corner while the run is in progress. It refreshes on the interval you set
(1–30 s) and shows, for every configured session:

- state — queued, launching, VPN sign-in, VPN connecting, IP check, loading,
  running, failed, or closed;
- assigned VPN country, flagged red when the measured exit country disagrees;
- public exit IP and city, read from inside that profile;
- resident memory and CPU percentage for that profile's whole Chrome process tree;
- host totals: RAM used vs. installed, CPU load, and core count;
- the country ledger — every country in the pool, and which session holds it.

Per-profile memory and CPU come from one batched process query per refresh
(`Get-CimInstance Win32_Process` on Windows, `ps` elsewhere). The browser process
for each session is matched by its unique temporary-profile directory name, then
its whole child tree is summed — so the number covers the renderer, GPU, and
utility processes, not just the browser process.

Chrome cannot raise its own window above other applications. On Windows the
monitor is pinned topmost through a `SetWindowPos` call; on macOS and Linux it is
positioned in the corner but stays in the normal window stacking order.

The extension popup also shows a condensed version of the same data, but it
disappears whenever the popup loses focus — which is why the separate window
exists.

## Surfshark VPN per profile

VPN mode gives every simultaneously running Chrome profile a different exit
country. It replaces proxy routing rather than layering on top of it, so the
launcher forces direct-connection mode at the Playwright level and lets the
Surfshark extension do the routing inside each profile.

### One-time preparation

1. Obtain the Surfshark Chrome extension as an **unpacked directory** — the folder
   that directly contains its `manifest.json`.
2. Enter that absolute path in the popup, along with the Surfshark account email
   and password. The password is held in memory for the launch and is never
   written to extension storage.
3. Pick the country pool. **Auto-pick the minimum unique set** selects as many
   countries as you have concurrent sessions.

### How countries are assigned

`native-host/country-allocator.mjs` is the ledger. It reserves a country *before*
Chrome starts, so two sessions launching in parallel can never be handed the same
one, and releases it when that Chrome window closes so the next queued session can
reuse it. Selection prefers a country nothing has used yet, then the least
recently released one. Consequences worth knowing:

- The pool must be at least as large as the concurrent session cap — the number of
  sessions you can run at once, capped at 20 — not the whole run. Launch is
  rejected up front if it is smaller.
- With a pool at least as large as the whole run, every session gets a country no
  other session in that run used.
- With a run longer than the pool, countries are recycled as windows close, and a
  country can appear more than once across the run — never at the same time.

The catalogue lives in `native-host/countries.js` and is shared by the native host
and the popup, so both always offer the same list. Surfshark changes its locations
over time; edit that one file to add or retire a country.

### Verifying the connection

After the tunnel reports connected, each session loads an IP endpoint from inside
its own profile and records the exit IP and country. If the measured country does
not match the assigned one, the monitor marks that row red and the launcher emits
a warning — the session still runs, because a geolocation database disagreeing
with a VPN exit is common and is not by itself a failure.

### When Surfshark's popup changes

The driver locates elements through `native-host/vpn/surfshark.selectors.json`,
which lists ordered candidate selectors per step (sign-in fields, the locations
list, a country row, the connect button, the connected indicator). It uses the
first candidate that becomes visible, and a failure names the step and every
selector it tried.

**These selectors are a best-effort map and have not been verified against a live
Surfshark build.** Expect to correct them on first use. Do it by creating
`native-host/vpn/surfshark.selectors.local.json`, which overrides the checked-in
map step by step and is not tracked by git:

```json
{
  "steps": {
    "countryOption": ["css=[data-country='{country}']"]
  }
}
```

Inspect the real popup with `chrome://extensions` → Surfshark → **service worker**
→ open the popup and use DevTools to read the actual attributes.

### Known limits

- Each session runs in a fresh temporary profile, so each one signs in to
  Surfshark again. Many concurrent sign-ins can trigger rate limiting, a CAPTCHA,
  or a device-verification prompt, none of which the driver can answer. Start with
  a small session count.
- Chrome restricts `--load-extension` in some recent and enterprise-managed
  builds. If sessions fail with a missing-popup error, confirm the extension
  actually loaded in one of the launched windows.
- A distinct country does not guarantee a distinct IP address, and the extension
  proxies browser traffic only — it is not a system-wide tunnel.

## Test before adding a provider

Enable **Direct-connection dry run** to test the complete local workflow without
entering proxy or VPN credentials. In this mode the proxy field is disabled, while
separate Chrome processes, temporary profiles, viewport/screen settings,
locale/timezone settings, the fleet monitor, queueing, and cleanup still operate
normally.

All dry-run sessions use the computer's normal internet connection and therefore
share its public IP. Disable dry-run mode and supply the full IPRoyal list, or
enable VPN mode, when you are ready to test real routing.

The operating system may constrain the outer window dimensions to the physical
display. The page viewport and `window.screen` values are configured independently
by Playwright for repeatable QA.

## Validate locally

```sh
cd native-host
npm test
```

`npm test` runs every `*.test.mjs` file: proxy parsing, launch validation, VPN and
dashboard configuration, the country ledger, and extension-ID derivation.

Syntax-check the remaining sources with:

```sh
node --check native-host/host.mjs
node --check native-host/system-stats.mjs
node --check native-host/dashboard-window.mjs
node --check background.js
```

`popup.js` is an ES module and needs `node --check` against a `.mjs` copy, or a
bundler, to be checked the same way.
