#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionId = process.argv[2] || "";
if (!/^[a-p]{32}$/.test(extensionId)) {
  process.stderr.write(
    "Usage: node scripts/install-native-host.mjs <32-character Chrome extension ID>\n",
  );
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const hostDir = path.join(projectDir, "native-host");
const hostPath = path.join(hostDir, "run-host.sh");
const nodePathFile = path.join(hostDir, ".node-path");

let manifestDir;
if (process.platform === "darwin") {
  manifestDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "NativeMessagingHosts",
  );
} else if (process.platform === "linux") {
  manifestDir = path.join(
    os.homedir(),
    ".config",
    "google-chrome",
    "NativeMessagingHosts",
  );
} else {
  process.stderr.write(
    "Automatic setup currently supports macOS and Linux. See README.md for the host manifest format.\n",
  );
  process.exit(1);
}

const manifestPath = path.join(
  manifestDir,
  "com.local.chrome_qa_launcher.json",
);
const manifest = {
  name: "com.local.chrome_qa_launcher",
  description: "Local companion for authorized isolated Chrome QA sessions",
  path: hostPath,
  type: "stdio",
  allowed_origins: [`chrome-extension://${extensionId}/`],
};

await fs.mkdir(manifestDir, { recursive: true });
await fs.chmod(hostPath, 0o755);
await fs.chmod(path.join(hostDir, "host.mjs"), 0o755);
await fs.writeFile(nodePathFile, `${process.execPath}\n`, { mode: 0o600 });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  mode: 0o600,
});

process.stdout.write(`Installed native host manifest:\n${manifestPath}\n`);
