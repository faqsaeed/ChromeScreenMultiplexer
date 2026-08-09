import test from "node:test";
import assert from "node:assert/strict";
import { CountryAllocator } from "./country-allocator.mjs";

test("never hands the same country to two live sessions", () => {
  const allocator = new CountryAllocator(["DE", "JP", "SG"]);
  const claims = ["a", "b", "c"].map((holder) => allocator.claim(holder).code);

  assert.equal(new Set(claims).size, 3);
  assert.equal(allocator.availableCount, 0);
});

test("reserves the country assigned to a fixed profile", () => {
  const allocator = new CountryAllocator(["DE", "JP"]);
  assert.equal(allocator.claimCode("JP", "profile-2").code, "JP");
  assert.equal(allocator.holderOf("JP"), "profile-2");
  assert.throws(
    () => allocator.claimCode("JP", "profile-1"),
    /already held by another running profile/,
  );
});

test("throws instead of duplicating when the pool is exhausted", () => {
  const allocator = new CountryAllocator(["DE"]);
  allocator.claim("a");

  assert.throws(() => allocator.claim("b"), /no unique country is left/);
});

test("returns a country to the pool when its session closes", () => {
  const allocator = new CountryAllocator(["DE", "JP"]);
  const first = allocator.claim("a");
  allocator.claim("b");

  assert.equal(allocator.availableCount, 0);
  allocator.releaseAllFor("a");
  assert.equal(allocator.availableCount, 1);

  const reused = allocator.claim("c");
  assert.equal(reused.code, first.code);
  assert.equal(allocator.holderOf(first.code), "c");
});

test("prefers a never-used country over one that was released", () => {
  const allocator = new CountryAllocator(["DE", "JP", "SG"]);
  allocator.claim("a"); // DE
  allocator.releaseAllFor("a");

  assert.equal(allocator.claim("b").code, "JP");
  assert.equal(allocator.claim("c").code, "SG");
  // Only now is the released country reused.
  assert.equal(allocator.claim("d").code, "DE");
});

test("reuses the least recently released country first", () => {
  const allocator = new CountryAllocator(["DE", "JP", "SG"]);
  allocator.claim("a"); // DE
  allocator.claim("b"); // JP
  allocator.claim("c"); // SG
  allocator.releaseAllFor("b");
  allocator.releaseAllFor("c");

  assert.equal(allocator.claim("d").code, "JP");
});

test("rejects an unusable pool", () => {
  assert.throws(() => new CountryAllocator([]), /cannot be empty/);
  assert.throws(() => new CountryAllocator(["DE", "DE"]), /duplicate country/);
  assert.throws(() => new CountryAllocator(["ZZ"]), /Unknown VPN country/);
});

test("normalises lower-case country codes", () => {
  const allocator = new CountryAllocator(["de", "jp"]);
  assert.equal(allocator.claim("a").code, "DE");
});

test("snapshot reports the ledger for the dashboard", () => {
  const allocator = new CountryAllocator(["DE", "JP"]);
  allocator.claim("session-1");

  const snapshot = allocator.snapshot();
  assert.deepEqual(
    snapshot.map(({ code, inUse, holder }) => ({ code, inUse, holder })),
    [
      { code: "DE", inUse: true, holder: "session-1" },
      { code: "JP", inUse: false, holder: null },
    ],
  );
});

test("releaseAll clears every holder", () => {
  const allocator = new CountryAllocator(["DE", "JP"]);
  allocator.claim("a");
  allocator.claim("b");
  allocator.releaseAll();

  assert.equal(allocator.availableCount, 2);
});
