import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

const SAMPLE_TIMEOUT_MS = 8000;
const IS_WINDOWS = process.platform === "win32";

function run(command, args) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: SAMPLE_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        resolve(error && !stdout ? null : String(stdout || ""));
      },
    );
  });
}

/**
 * Windows: one CIM query for every Chrome process, including the command line
 * (which carries --user-data-dir) and cumulative kernel/user CPU time.
 */
async function listWindowsProcesses() {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
    "Select-Object ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime,CommandLine | " +
    "ConvertTo-Json -Compress -Depth 2";

  const stdout = await run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);

  if (!stdout || !stdout.trim()) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row) => row && row.ProcessId)
    .map((row) => ({
      pid: Number(row.ProcessId),
      ppid: Number(row.ParentProcessId) || 0,
      rssBytes: Number(row.WorkingSetSize) || 0,
      // Win32_Process reports CPU time in 100-nanosecond units.
      cpuMs:
        (Number(row.KernelModeTime || 0) + Number(row.UserModeTime || 0)) /
        10_000,
      commandLine: String(row.CommandLine || ""),
    }));
}

/** `[DD-]HH:MM:SS[.ff]`, `MM:SS.ff`, or plain seconds, as printed by ps. */
function parsePsTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return 0;
  }

  const [dayPart, clockPart] = text.includes("-")
    ? text.split("-")
    : [null, text];
  const days = dayPart ? Number(dayPart) || 0 : 0;
  const units = clockPart.split(":").map((part) => Number(part) || 0);

  while (units.length < 3) {
    units.unshift(0);
  }

  const [hours, minutes, seconds] = units.slice(-3);
  return ((days * 24 + hours) * 3600 + minutes * 60 + seconds) * 1000;
}

async function listUnixProcesses() {
  const stdout = await run("ps", ["-Awwo", "pid=,ppid=,rss=,time=,command="]);
  if (!stdout) {
    return [];
  }

  const rows = [];
  for (const line of stdout.split("\n")) {
    const match = line
      .trim()
      .match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) {
      continue;
    }

    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssBytes: Number(match[3]) * 1024,
      cpuMs: parsePsTime(match[4]),
      commandLine: match[5],
    });
  }
  return rows;
}

function collectTree(rootPid, childrenByParent, byPid) {
  const collected = [];
  const stack = [rootPid];
  const seen = new Set();

  while (stack.length > 0) {
    const pid = stack.pop();
    if (seen.has(pid)) {
      continue;
    }
    seen.add(pid);

    const process = byPid.get(pid);
    if (process) {
      collected.push(process);
    }
    for (const child of childrenByParent.get(pid) || []) {
      stack.push(child);
    }
  }

  return collected;
}

export function createSystemMonitor() {
  let previousCpuByPid = new Map();
  let previousSampleAt = 0;
  let previousHostCpu = os.cpus();

  function hostCpuPercent() {
    const current = os.cpus();
    let idleDelta = 0;
    let totalDelta = 0;

    current.forEach((cpu, index) => {
      const before = previousHostCpu[index];
      if (!before) {
        return;
      }
      const beforeTotal = Object.values(before.times).reduce((a, b) => a + b, 0);
      const afterTotal = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      idleDelta += cpu.times.idle - before.times.idle;
      totalDelta += afterTotal - beforeTotal;
    });

    previousHostCpu = current;
    if (totalDelta <= 0) {
      return null;
    }
    return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
  }

  /**
   * @param {Array<{id: string, profileDir: string}>} targets
   * @returns {Promise<{host: object, sessions: Map<string, object>}>}
   */
  async function sample(targets) {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const host = {
      platform: process.platform,
      cores: os.cpus().length,
      totalBytes,
      freeBytes,
      usedBytes: totalBytes - freeBytes,
      cpuPercent: hostCpuPercent(),
      uptimeSeconds: Math.round(os.uptime()),
    };

    const sessions = new Map();
    if (!targets || targets.length === 0) {
      previousCpuByPid = new Map();
      return { host, sessions };
    }

    const processes = IS_WINDOWS
      ? await listWindowsProcesses()
      : await listUnixProcesses();

    if (processes.length === 0) {
      return { host, sessions, unavailable: true };
    }

    const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
    const childrenByParent = new Map();
    for (const entry of processes) {
      if (!childrenByParent.has(entry.ppid)) {
        childrenByParent.set(entry.ppid, []);
      }
      childrenByParent.get(entry.ppid).push(entry.pid);
    }

    const now = Date.now();
    const elapsedMs = previousSampleAt ? now - previousSampleAt : 0;
    const nextCpuByPid = new Map();

    for (const target of targets) {
      // mkdtemp gives every profile a unique basename, which survives any
      // quoting or path normalisation Chrome applies to --user-data-dir.
      const needle = path.basename(target.profileDir).toLowerCase();
      const root = processes.find((entry) =>
        entry.commandLine.toLowerCase().includes(needle),
      );

      if (!root) {
        sessions.set(target.id, {
          rssBytes: null,
          cpuPercent: null,
          processCount: 0,
          rootPid: null,
        });
        continue;
      }

      const tree = collectTree(root.pid, childrenByParent, byPid);
      let rssBytes = 0;
      let cpuDeltaMs = 0;

      for (const entry of tree) {
        rssBytes += entry.rssBytes;
        nextCpuByPid.set(entry.pid, entry.cpuMs);
        const before = previousCpuByPid.get(entry.pid);
        if (before !== undefined && entry.cpuMs >= before) {
          cpuDeltaMs += entry.cpuMs - before;
        }
      }

      const cpuPercent =
        elapsedMs > 0
          ? Math.max(
              0,
              Math.min(100, (cpuDeltaMs / (elapsedMs * host.cores)) * 100),
            )
          : null;

      sessions.set(target.id, {
        rssBytes,
        cpuPercent,
        processCount: tree.length,
        rootPid: root.pid,
      });
    }

    previousCpuByPid = nextCpuByPid;
    previousSampleAt = now;
    return { host, sessions };
  }

  return { sample };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
