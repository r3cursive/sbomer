import { expect, test } from "bun:test";
import { plausible } from "../../src/pick";

const now = Date.parse("2026-10-25T00:00:00Z");
const base = { fullName: "o/r", defaultBranch: "main", isFork: false };

test("rejects a month-old repo with 41k stars (postmortem 004)", () => {
  expect(plausible({ ...base, stargazersCount: 41265, createdAt: "2026-09-24T00:00:00Z" }, now, 365, 100)).toBe(false);
});

test("rejects young repos even with modest stars", () => {
  expect(plausible({ ...base, stargazersCount: 300, createdAt: "2026-06-01T00:00:00Z" }, now, 365, 100)).toBe(false);
});

test("rejects old repos with an implausible lifetime star rate", () => {
  expect(plausible({ ...base, stargazersCount: 200_000, createdAt: "2025-09-01T00:00:00Z" }, now, 365, 100)).toBe(false);
});

test("accepts an established project like trivy", () => {
  expect(plausible({ ...base, stargazersCount: 30_000, createdAt: "2019-04-11T00:00:00Z" }, now, 365, 100)).toBe(true);
});

test("rejects forks", () => {
  expect(plausible({ ...base, isFork: true, stargazersCount: 500, createdAt: "2018-01-01T00:00:00Z" }, now, 365, 100)).toBe(false);
});
