import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gaps } from "../../src/inspect";

function repo(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "sbomer-inspect-"));
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "");
  }
  return dir;
}

test("Gradle builds without a lockfile are a gap even when the wrapper shows up (servo, 001)", () => {
  const dir = repo(["android/build.gradle.kts", "android/app/build.gradle.kts"]);
  const bom = { bomFormat: "CycloneDX" as const, specVersion: "1.6",
    components: [{ purl: "pkg:maven/org.gradle.wrapper.GradleWrapperMain/gradle-wrapper" }] };
  const g = gaps(dir, bom).gaps;
  expect(g.map((x) => [x.ecosystem, x.reason])).toEqual([["maven", "no components"]]);
});

test("Gradle with versions.lock and resolved components is covered", () => {
  const dir = repo(["build.gradle", "versions.lock"]);
  const bom = { bomFormat: "CycloneDX" as const, specVersion: "1.6", components: [{ purl: "pkg:maven/com.google/guava@33" }] };
  expect(gaps(dir, bom).gaps).toEqual([]);
});

test("Gradle with real components but no lockfile is still flagged", () => {
  const dir = repo(["build.gradle"]);
  const bom = { bomFormat: "CycloneDX" as const, specVersion: "1.6", components: [{ purl: "pkg:maven/com.google/guava@33" }] };
  expect(gaps(dir, bom).gaps[0]?.reason).toBe("build files without a lockfile");
});

test("fixture directories are excluded, real test requirements are not (trivy, 003)", async () => {
  const { isExcluded } = await import("../../src/inspect");
  const globs = ["**/testdata/**", "**/test/fixtures/**"];
  expect(isExcluded("pkg/fanal/analyzer/language/python/pip/testdata/requirements.txt", globs)).toBe(true);
  expect(isExcluded("test/fixtures/package-lock.json", globs)).toBe(true);
  expect(isExcluded("test/requirements.txt", globs)).toBe(false);
  expect(isExcluded("go.mod", globs)).toBe(false);
});
