import test from "node:test";
import assert from "node:assert/strict";
import { COUNTRY_CATALOGUE, personaForCountry } from "./countries.js";

test("every Surfshark country has a regional persistent persona", () => {
  const personas = COUNTRY_CATALOGUE.map((country, index) =>
    personaForCountry(country.code, index),
  );

  assert.equal(personas.length, COUNTRY_CATALOGUE.length);
  assert.ok(personas.every((persona) => persona.locale && persona.timezoneId));
  assert.equal(
    new Set(personas.map(({ width, height }) => `${width}x${height}`)).size,
    personas.length,
  );
});

test("persona generation is stable for a numbered slot", () => {
  assert.deepEqual(personaForCountry("JP", 3), personaForCountry("jp", 3));
  assert.equal(personaForCountry("ZZ", 0), null);
});
