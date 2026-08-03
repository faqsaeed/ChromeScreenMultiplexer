#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOST_NAME = "com.local.chrome_qa_launcher";

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
const nodePathFile = path.join(hostDir, ".node-path");

function buildManifest(hostPath) {
  return {
    name: HOST_NAME,
    description: "Local companion for authorized isolated Chrome QA sessions",
    path: hostPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

function registryAdd(key, value) {
  return new Promise((resolve, reject) => {
    execFile(
      "reg.exe",
      ["add", key, "/ve", "/t", "REG_SZ", "/d", value, "/f"],
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve();
      },
    );
  });
}

async function installWindows() {
  const hostPath = path.join(hostDir, "run-host.cmd");
  // On Windows the manifest lives next to the host and the registry points at it.
  const manifestPath = path.join(hostDir, `${HOST_NAME}.json`);

  await fs.writeFile(nodePathFile, `${process.execPath}\n`);
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(buildManifest(hostPath), null, 2)}\n`,
  );

  for (const root of [
    "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts",
    "HKCU\\Software\\Chromium\\NativeMessagingHosts",
  ]) {
    await registryAdd(`${root}\\${HOST_NAME}`, manifestPath).catch(() => {});
  }

  return manifestPath;
}

async function installPosix() {
  const hostPath = path.join(hostDir, "run-host.sh");
  const manifestDir =
    process.platform === "darwin"
      ? path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Google",
          "Chrome",
          "NativeMessagingHosts",
        )
      : path.join(os.homedir(), ".config", "google-chrome", "NativeMessagingHosts");

  const manifestPath = path.join(manifestDir, `${HOST_NAME}.json`);

  await fs.mkdir(manifestDir, { recursive: true });
  await fs.chmod(hostPath, 0o755);
  await fs.chmod(path.join(hostDir, "host.mjs"), 0o755);
  await fs.writeFile(nodePathFile, `${process.execPath}\n`, { mode: 0o600 });
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(buildManifest(hostPath), null, 2)}\n`,
    { mode: 0o600 },
  );

  return manifestPath;
}

const manifestPath =
  process.platform === "win32" ? await installWindows() : await installPosix();

process.stdout.write(`Installed native host manifest:\n${manifestPath}\n`);
