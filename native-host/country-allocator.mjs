import { findCountry } from "./countries.js";

/**
 * Tracks which VPN country each live Chrome profile holds.
 *
 * Two Chrome profiles are never allowed to hold the same country at the same
 * time. Persistent personas use `claimCode` to reserve their fixed assignment;
 * `claim` remains available for legacy dynamically allocated runs.
 */
export class CountryAllocator {
  #entries = new Map();
  #order = [];
  #releaseSequence = 0;

  constructor(pool) {
    const codes = (pool || []).map((code) => String(code || "").toUpperCase());

    if (codes.length === 0) {
      throw new Error("The VPN country pool cannot be empty.");
    }
    if (new Set(codes).size !== codes.length) {
      throw new Error("The VPN country pool contains a duplicate country.");
    }

    codes.forEach((code, index) => {
      const country = findCountry(code);
      if (!country) {
        throw new Error(`Unknown VPN country "${code}".`);
      }

      this.#order.push(code);
      this.#entries.set(code, {
        ...country,
        poolIndex: index,
        holder: null,
        useCount: 0,
        releaseSequence: -1,
      });
    });
  }

  get size() {
    return this.#order.length;
  }

  get availableCount() {
    return this.#order.filter((code) => !this.#entries.get(code).holder).length;
  }

  /**
   * Reserve a country for `holder`. Throws when every country is already held,
   * which is the condition the launch validation is meant to prevent.
   */
  claim(holder) {
    if (!holder) {
      throw new Error("A country claim requires a session holder.");
    }

    const free = this.#order
      .map((code) => this.#entries.get(code))
      .filter((entry) => !entry.holder);

    if (free.length === 0) {
      throw new Error(
        `All ${this.size} VPN countries are in use; no unique country is left for this session.`,
      );
    }

    free.sort(
      (a, b) =>
        a.useCount - b.useCount ||
        a.releaseSequence - b.releaseSequence ||
        a.poolIndex - b.poolIndex,
    );

    const entry = free[0];
    entry.holder = holder;
    entry.useCount += 1;
    return this.describe(entry.code);
  }

  /** Reserve the country permanently assigned to a numbered profile. */
  claimCode(code, holder) {
    if (!holder) {
      throw new Error("A country claim requires a session holder.");
    }
    const entry = this.#entries.get(String(code || "").toUpperCase());
    if (!entry) {
      throw new Error(`Unknown VPN country "${code}".`);
    }
    if (entry.holder && entry.holder !== holder) {
      throw new Error(
        `${entry.name} is already held by another running profile.`,
      );
    }
    if (!entry.holder) {
      entry.holder = holder;
      entry.useCount += 1;
    }
    return this.describe(entry.code);
  }

  release(code) {
    const entry = this.#entries.get(String(code || "").toUpperCase());
    if (!entry || !entry.holder) {
      return false;
    }

    entry.holder = null;
    entry.releaseSequence = ++this.#releaseSequence;
    return true;
  }

  releaseAllFor(holder) {
    let released = 0;
    for (const entry of this.#entries.values()) {
      if (entry.holder === holder) {
        this.release(entry.code);
        released += 1;
      }
    }
    return released;
  }

  releaseAll() {
    for (const entry of this.#entries.values()) {
      entry.holder = null;
    }
  }

  holderOf(code) {
    return this.#entries.get(String(code || "").toUpperCase())?.holder || null;
  }

  describe(code) {
    const entry = this.#entries.get(String(code || "").toUpperCase());
    if (!entry) {
      return null;
    }

    return {
      code: entry.code,
      name: entry.name,
      label: entry.label,
      flag: entry.flag,
      holder: entry.holder,
      useCount: entry.useCount,
    };
  }

  /** The tally the dashboard renders: every country and who holds it. */
  snapshot() {
    return this.#order.map((code) => {
      const entry = this.#entries.get(code);
      return {
        code: entry.code,
        name: entry.name,
        flag: entry.flag,
        holder: entry.holder,
        useCount: entry.useCount,
        inUse: Boolean(entry.holder),
      };
    });
  }
}
