import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUnlocked, parseCompiled, unlockedRequirements } from "../../src/layers/resolve";

// Shapes from 3b1b/manim (postmortem 002): bare names, ranges and environment markers.
test("bare names, ranges and markers count as unlocked", () => {
  expect(isUnlocked("numpy\nipython>=8.18.0\n")).toBe(true);
  expect(isUnlocked("typing-extensions; python_version < '3.11'\n")).toBe(true);
});

test("fully pinned files with comments and options are locked", () => {
  expect(isUnlocked("# pinned\n-r base.txt\nBrotli==1.0.7\ncertifi==2024.2.2 ; python_version>'3'\n")).toBe(false);
});

test("a Python lockfile anywhere in the repo turns resolution off", () => {
  const dir = mkdtempSync(join(tmpdir(), "sbomer-resolve-"));
  writeFileSync(join(dir, "requirements.txt"), "numpy\n");
  expect(unlockedRequirements(dir)).toEqual(["requirements.txt"]);
  writeFileSync(join(dir, "uv.lock"), "");
  expect(unlockedRequirements(dir)).toEqual([]);
});

test("compiled output becomes tagged pypi components with normalized names", () => {
  const [c] = parseCompiled("Typing_Extensions==4.12.2 ; python_full_version < '3.11'\n", "requirements.txt");
  expect(c?.purl).toBe("pkg:pypi/typing-extensions@4.12.2");
  expect(c?.properties).toContainEqual({ name: "sbomer:resolution", value: "resolved" });
});
