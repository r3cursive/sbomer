import { expect, test } from "bun:test";
import { findLeaks } from "../../scripts/public-check";

// Fixtures are assembled at runtime so this file doesn't trip the pre-commit scan itself.
const j = (...parts: string[]) => parts.join("");

test("flags local paths, tailnet hosts, private IPs and personal email", () => {
  const hits = findLeaks(`see ${j("/ho", "me/alice")}/x, ${j("box.tailabc", ".ts.net")}, ${j("192.", "168.1.20")}, ${j("alice", "@gmail.com")}`, []);
  expect(hits.map((h) => h.split(":")[0])).toEqual(["home directory path", "tailnet hostname", "private IPv4", "email address"]);
});

test("allows localhost, noreply email and public hosts", () => {
  expect(findLeaks("http://127.0.0.1:8081 1+bot@users.noreply.github.com github.com", [])).toEqual([]);
});

test("deny-list terms match whole words, case-insensitive", () => {
  expect(findLeaks("Hello Bob, bobcat", [/\bbob\b/gi])).toEqual(["deny-list term: Bob"]);
});

test("flags .env-style secrets but not code assignments", () => {
  expect(findLeaks(j("DT_API_KEY", "=abcdef123456"), []).length).toBe(1);
  expect(findLeaks("process.env.DT_API_KEY = key.key;", [])).toEqual([]);
});
