# ChromeScreenMultiplexer

This project launches separate, visible Chrome processes for authorized browser
compatibility and regional QA. Each process receives:

- its own numbered, persistent Chrome profile and browser storage;
- one fixed Surfshark VPN country bound to that profile;
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

The Surfshark launcher accepts up to 66 persistent profiles (one per country in
the bundled catalogue) and keeps at most 20 Chrome processes active
simultaneously. You choose the initial active count and whether queue vacancies
are filled automatically or only when **Promote next queued** is clicked. VPN
credentials are sent only to the local native companion and are not saved.
Cookies, cache, extension login, and other profile storage survive normal closes
and **Stop all**; use the per-row **Reset** control to wipe one profile.

## Requirements

- Windows 10/11, macOS, or Linux
- Google Chrome
- Node.js 20 or newer
- For VPN mode: a Surfshark account; install its Chrome Web Store extension
  manually inside each persistent window created by **Prepare profiles**

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
3. Choose how many persistent profiles to use (24 by default), how many to open
   initially (up to 20), and automatic or manual queue control.
4. Select one Surfshark country per profile and choose **Generate
   country-matched personas**. The country, locale, timezone, and screen size are
   bound to the numbered slot and saved across launches.
5. For the first run, confirm authorization and choose **Prepare profiles**.
   It opens blank persistent Chrome windows and does not navigate or close them.
   Install Surfshark yourself, sign in, and connect the country shown for that
   profile in the fleet monitor.
6. On later runs, leave the credentials blank and choose **Launch sessions**.
   The launcher uses the saved Surfshark login, reconnects the assigned country,
   checks the exit IP, and then opens the current target URL.
   Profiles start two at a time to avoid starving Chrome extension workers, but
   the selected active limit still controls how many remain open concurrently.
7. Use **Stop all** to close the launched processes and cancel the queue. Saved
   profile storage is retained.

## Fleet monitor

Enable **Open the live stats window** to get a compact Chrome window pinned to a
screen corner while the run is in progress. It refreshes on the interval you set
(1–30 s) and shows, for every configured session:

- state — queued, launching, VPN sign-in, VPN connecting, IP check, loading,
  running, needs attention, failed, or closed;
- assigned VPN country, flagged red when the measured exit country disagrees;
- public exit IP and city, read from inside that profile;
- resident memory and CPU percentage for that profile's whole Chrome process tree;
- host totals: RAM used vs. installed, CPU load, and core count;
- the country ledger — every country in the pool, and which session holds it.

During manual preparation, the monitor checks each active Surfshark extension
about every 10 seconds without navigating its visible tab. A verified matching
exit turns the profile row and ledger country green and shows **VPN connected**,
the exit country, and public IP. An unconnected or wrong-country exit is flagged.

The monitor is also the live admin control surface. Paste a new authorized URL
and choose **Open in running + queued** to navigate all running profiles and set
the target for every queued profile. In manual queue mode, **Promote next queued**
opens exactly one waiting profile when a slot is available. Each row has a
**Close** button that preserves its data and a **Reset** button that closes and
deletes only that persistent profile.

Per-profile memory and CPU come from one batched process query per refresh
(`Get-CimInstance Win32_Process` on Windows, `ps` elsewhere). The browser process
for each session is matched by its unique persistent-profile directory name, then
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

1. Leave **Unpacked Surfshark folder** blank and choose **Prepare profiles**.
   Each new persistent profile opens as a blank Chrome window and stays open
   until you close it. Manually visit Surfshark's official Chrome Web Store page
   and select **Add to Chrome** once in that profile.
2. Open Surfshark and choose **Log in with another device**. Scan the displayed
   QR code with a device already logged in to Surfshark, or enter its temporary
   login code from Surfshark's account settings. Then connect the profile to the
   country shown in the fleet monitor and close it.
3. Credentials are optional. The password is never written to extension storage.
4. Pick one country per profile. **Auto-pick one country per profile** creates a
   complete unique set and shows the numbered profile-to-country mapping.

### How countries are assigned

`native-host/country-allocator.mjs` remains the live ownership ledger, but it no
longer chooses countries dynamically. The numbered slot mapping is stored in
`personas.json` under the launcher's local data directory. Profile 3 therefore
keeps the same country, locale, timezone, and viewport on every run. Resetting a
profile deletes both its browser data and its saved persona assignment so it can
be assigned afresh on the next launch.

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

- Surfshark sessions can expire. If an automated launch finds a signed-out
  profile and no credentials were supplied, it marks that open window as
  **Needs attention**; sign in again there or prepare/reset that profile.
- A connection or target-page error does not close a persistent Chrome window.
  The monitor keeps it in the active count and shows **Needs attention** so you
  can reconnect Surfshark or enter a URL manually.
- Chrome restricts `--load-extension` in some recent and enterprise-managed
  builds. If sessions fail with a missing-popup error, confirm the extension
  actually loaded in one of the launched windows.
- A distinct country does not guarantee a distinct IP address, and the extension
  proxies browser traffic only — it is not a system-wide tunnel.

## Test before adding a provider

Enable **Direct-connection dry run** to test the complete local workflow without
entering proxy or VPN credentials. In this mode the proxy field is disabled, while
separate Chrome processes, persistent profiles, viewport/screen settings,
locale/timezone settings, the fleet monitor, and queueing still operate
normally.

All dry-run sessions use the computer's normal internet connection and therefore
share its public IP. Enable VPN mode when you are ready to test Surfshark routing.

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
