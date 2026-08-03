import crypto from "node:crypto";

/**
 * Chrome maps the first 16 bytes of a SHA-256 digest into the a-p alphabet to
 * build an extension ID.
 */
function digestToId(digest) {
  return [...digest.subarray(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .split("")
    .map((hex) => String.fromCharCode(97 + Number.parseInt(hex, 16)))
    .join("");
}

/** ID for a packed extension, derived from the manifest's `key` field. */
export function idFromManifestKey(key) {
  const der = Buffer.from(String(key), "base64");
  return digestToId(crypto.createHash("sha256").update(der).digest());
}

/**
 * ID Chrome assigns to an unpacked extension with no `key`: the hash of the
 * absolute directory path. Chromium hashes the raw FilePath character buffer,
 * which is UTF-16LE on Windows and bytes elsewhere.
 */
export function idFromPath(absolutePath) {
  const bytes = Buffer.from(
    absolutePath,
    process.platform === "win32" ? "utf16le" : "utf8",
  );
  return digestToId(crypto.createHash("sha256").update(bytes).digest());
}

const EXTENSION_URL = /^chrome-extension:\/\/([a-p]{32})\//;

function idFromUrl(url) {
  return EXTENSION_URL.exec(String(url || ""))?.[1] || null;
}

/**
 * Prefer the ID Chrome actually assigned: a loaded extension exposes it on its
 * service worker (MV3) or background page (MV2) URL. Falls back to deriving it.
 */
export async function resolveExtensionId(context, manifest, extensionPath, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const urls = [
      ...context.serviceWorkers().map((worker) => worker.url()),
      ...context.backgroundPages().map((page) => page.url()),
    ];

    for (const url of urls) {
      const id = idFromUrl(url);
      if (id) {
        return { id, source: "runtime" };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (manifest?.key) {
    return { id: idFromManifestKey(manifest.key), source: "manifest-key" };
  }
  return { id: idFromPath(extensionPath), source: "path" };
}
