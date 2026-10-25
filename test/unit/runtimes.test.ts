import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDockerfile, runtimeComponents, scanRuntimes } from "../../src/layers/runtimes";

test("Wallos shape: a single FROM php:8.3-fpm-alpine (postmortem 005)", () => {
  expect(parseDockerfile("# syntax\nFROM php:8.3-fpm-alpine\nRUN echo hi\n")).toEqual([{ image: "php:8.3-fpm-alpine", line: 2 }]);
});

test("multi-stage: build stages, scratch and --platform are handled", () => {
  const df = [
    "ARG NODE=24-alpine",
    "FROM --platform=$BUILDPLATFORM node:${NODE} AS build",
    "FROM build AS test",
    "FROM scratch",
    "FROM php:8.3-cli",
  ].join("\n");
  expect(parseDockerfile(df).map((f) => f.image)).toEqual(["node:24-alpine", "php:8.3-cli"]);
});

test("unresolvable ARGs are skipped rather than guessed", () => {
  expect(parseDockerfile("ARG BASE\nFROM ${BASE}\n")).toEqual([]);
});

test("image env becomes a runtime component with an NVD-matchable CPE", () => {
  const [php] = runtimeComponents(["PATH=/usr/bin", "PHP_VERSION=8.3.36"], "php:8.3-fpm-alpine", "Dockerfile:2");
  expect(php?.purl).toBe("pkg:generic/php@8.3.36");
  expect(php?.cpe).toBe("cpe:2.3:a:php:php:8.3.36:*:*:*:*:*:*:*");
  expect(php?.properties).toContainEqual({ name: "sbomer:resolution", value: "image-env" });
});

test("Temurin-style JAVA_VERSION is normalized", () => {
  expect(runtimeComponents(["JAVA_VERSION=jdk-21.0.4+7"], "eclipse-temurin:21", "Dockerfile:1")[0]?.version).toBe("21.0.4");
});

test("images that can't be inspected are reported, not dropped silently", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sbomer-rt-"));
  writeFileSync(join(dir, "Dockerfile"), "FROM php:8.3-cli\nFROM private.example.com/base:1\n");
  const fake = async (img: string) => (img.startsWith("php") ? ["PHP_VERSION=8.3.36"] : undefined);
  const r = await scanRuntimes(dir, fake);
  expect(r.components.map((c) => c.name)).toEqual(["php"]);
  expect(r.unresolved).toEqual(["Dockerfile:2 private.example.com/base:1"]);
});
