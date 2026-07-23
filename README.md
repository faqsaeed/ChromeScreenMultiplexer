# Authorized Chrome QA Launcher

This project launches separate, visible Chrome processes for authorized browser
compatibility and regional QA. Each process receives:

- its own temporary Chrome profile and browser storage;
- one explicit HTTP/HTTPS/SOCKS5 proxy configuration;
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

The launcher accepts up to 20 test configurations and keeps at most eight Chrome
processes active simultaneously. Extra configurations remain queued; closing an
active test window opens the next one. Proxy credentials are sent only to the local
native companion and are not saved by the extension. Temporary profiles are removed
when sessions close or when **Stop all** is used, on a best-effort basis.

## Requirements

- macOS or Linux
- Google Chrome
- Node.js 20 or newer
- One unique IPRoyal proxy configuration per test session

For IPRoyal Residential, generate a sticky proxy list in the dashboard using:

```text
host:port:username:password
```

Use a distinct sticky session identifier in each row. A unique configuration does
not itself guarantee that the provider assigned a unique exit IP.

## Install on macOS

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `ChromeExtention` directory.
4. Copy the extension's 32-character ID shown by Chrome.
5. Run:

   ```sh
   cd /Users/spidey/projects/ChromeExtention
   chmod +x setup-macos.sh
   ./setup-macos.sh YOUR_EXTENSION_ID
   ```

6. Return to `chrome://extensions` and reload the extension.

The setup script installs `playwright-core` locally and registers
`com.local.chrome_qa_launcher` as a native-messaging host for that exact extension
ID. It does not install another browser; it launches the Google Chrome already in
`/Applications`. Setup records the exact Node.js executable path so Chrome does not
have to discover Homebrew or `nvm` from its restricted environment.

## Use

1. Open the extension.
2. Enter the owned or authorized test URL.
3. Choose a session count from 1 to 20. Use **Generate rows for session count**
   if you want a complete starter environment matrix.
4. Enter exactly one environment row per session:

   ```text
   1366x768 | en-US | America/New_York
   1440x900 | en-GB | Europe/London
   1536x864 | en-SG | Asia/Singapore
   ```

5. Paste exactly one unique IPRoyal proxy row per session.
6. Confirm authorization and select **Launch sessions**.
7. Up to eight processes open initially. If more configurations are queued, closing
   one active Chrome window opens the next.
8. Use **Stop all** to close the launched processes, cancel the queue, and remove
   temporary profiles.

## Test before adding IPRoyal

Enable **Direct-connection dry run** to test the complete local workflow without
entering proxy credentials. In this mode the proxy field is disabled, while separate
Chrome processes, temporary profiles, viewport/screen settings, locale/timezone
settings, queueing, and cleanup still operate normally.

All dry-run sessions use the computer's normal internet connection and therefore
share its public IP. Disable dry-run mode and supply the full IPRoyal list when you
are ready to test proxy routing.

The operating system may constrain the outer window dimensions to the physical
display. The page viewport and `window.screen` values are configured independently
by Playwright for repeatable QA.

## Validate locally

```sh
cd /Users/spidey/projects/ChromeExtention/native-host
npm test
node --check host.mjs
node --check lib.mjs
```

The extension files can be syntax-checked with:

```sh
cd /Users/spidey/projects/ChromeExtention
node --check background.js
node --check popup.js
```
