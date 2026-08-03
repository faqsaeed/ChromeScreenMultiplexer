import test from "node:test";
import assert from "node:assert/strict";
import { idFromManifestKey, idFromPath } from "./extension-id.mjs";

const ID_PATTERN = /^[a-p]{32}$/;

test("derives a well-formed ID from an unpacked path", () => {
  const id = idFromPath("/tmp/surfshark-extension");
  assert.match(id, ID_PATTERN);
});

test("path-derived IDs are stable and path-specific", () => {
  assert.equal(idFromPath("/tmp/one"), idFromPath("/tmp/one"));
  assert.notEqual(idFromPath("/tmp/one"), idFromPath("/tmp/two"));
});

test("derives a well-formed ID from a manifest key", () => {
  const key = Buffer.from("fake-der-public-key").toString("base64");
  const id = idFromManifestKey(key);

  assert.match(id, ID_PATTERN);
  assert.equal(id, idFromManifestKey(key));
});

test("a keyed extension does not collide with its unpacked path", () => {
  const key = Buffer.from("fake-der-public-key").toString("base64");
  assert.notEqual(idFromManifestKey(key), idFromPath("/tmp/surfshark"));
});
