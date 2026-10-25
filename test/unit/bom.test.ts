import { expect, test } from "bun:test";
import { normalize } from "../../src/bom";
import type { Bom } from "../../src/layers/deps";

// Shapes taken from a syft scan of servo/servo (postmortem 001).
const bom: Bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  components: [
    { "bom-ref": "a", type: "library", name: "serde", purl: "pkg:cargo/serde@1.0.0" },
    { "bom-ref": "b", type: "library", name: "./.github/actions/apt-mirrors", version: "UNKNOWN" },
    { "bom-ref": "c", type: "file", name: "/Cargo.lock" },
    { "bom-ref": "d", type: "library", name: "actions/checkout", purl: "pkg:github/actions/checkout@v4" },
  ],
  dependencies: [{ ref: "a", dependsOn: ["b", "c", "d"] }, { ref: "c" }],
};

test("drops file entries and repo-local actions, keeps matchable components", () => {
  const { bom: out, dropped } = normalize(bom);
  expect(dropped).toBe(2);
  expect((out.components as { name: string }[]).map((c) => c.name)).toEqual(["serde", "actions/checkout"]);
});

test("removes dropped refs from the dependency graph", () => {
  const { bom: out } = normalize(bom);
  expect(out.dependencies).toEqual([{ ref: "a", dependsOn: ["d"] }]);
});
