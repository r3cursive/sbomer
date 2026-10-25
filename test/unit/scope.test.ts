import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devKeys, tagDev } from "../../src/layers/scope";

// Shape from impress/impress.js (postmortem 004): lockfile v2, nearly everything dev.
const lock = {
  lockfileVersion: 2,
  packages: {
    "": { name: "impress.js" },
    "node_modules/uglify-js": { version: "3.17.4", dev: true },
    "node_modules/@babel/core": { version: "7.24.0", dev: true },
    "node_modules/left-pad": { version: "1.3.0" },
  },
};

test("collects dev-only packages, including scoped names", () => {
  expect([...devKeys(lock)].sort()).toEqual(["@babel/core@7.24.0", "uglify-js@3.17.4"]);
});

test("tags dev components and leaves runtime ones alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "sbomer-scope-"));
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock));
  const bom = {
    bomFormat: "CycloneDX" as const, specVersion: "1.6",
    components: [
      { name: "core", group: "@babel", version: "7.24.0", purl: "pkg:npm/%40babel/core@7.24.0" },
      { name: "left-pad", version: "1.3.0", purl: "pkg:npm/left-pad@1.3.0" },
    ],
  };
  const { bom: out, tagged } = tagDev(bom, dir);
  expect(tagged).toBe(1);
  const [babel, pad] = out.components as { properties?: { name: string; value: string }[] }[];
  expect(babel?.properties).toEqual([{ name: "sbomer:scope", value: "dev" }]);
  expect(pad?.properties).toBeUndefined();
});

test("a package that is runtime in any lockfile stays untagged", () => {
  const dir = mkdtempSync(join(tmpdir(), "sbomer-scope-"));
  mkdirSync(join(dir, "app"));
  writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock));
  writeFileSync(join(dir, "app", "package-lock.json"), JSON.stringify({ packages: { "node_modules/uglify-js": { version: "3.17.4" } } }));
  const bom = { bomFormat: "CycloneDX" as const, specVersion: "1.6", components: [{ name: "uglify-js", version: "3.17.4", purl: "pkg:npm/uglify-js@3.17.4" }] };
  expect(tagDev(bom, dir).tagged).toBe(0);
});
