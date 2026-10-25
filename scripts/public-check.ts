#!/usr/bin/env bun
// Blocks commits that would leak local details into this public repo.
//   bun scripts/public-check.ts            check staged files (pre-commit)
//   bun scripts/public-check.ts --all      check every tracked file
//   bun scripts/public-check.ts --msg FILE check a commit message (commit-msg)
// Generic patterns live here. Personal terms (names, hostnames, employers) go in public-deny.local.txt,
// one per line, which is gitignored so the deny list itself never gets published.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const ALLOWED_EMAIL = /@(users\.noreply\.github\.com|anthropic\.com|example\.(com|org))$/i;

const PATTERNS: [string, RegExp][] = [
  ["home directory path", /(?:\/home\/|\/Users\/)[a-z0-9_.-]+/gi],
  ["tailnet hostname", /\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/gi],
  ["private IPv4", /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g],
  ["email address", /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi],
  // .env-style lines only (NAME=value at line start), so code like `process.env.X = y` passes.
  ["secret-looking assignment", /^\s*(?:export\s+)?[A-Z0-9_]*(?:API_KEY|PASSWORD|TOKEN|SECRET)=\S{8,}/gm],
];

function denyTerms(): RegExp[] {
  const f = join(ROOT, "public-deny.local.txt");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"));
}

// This file's own patterns would trip the scan.
const SKIP = new Set(["scripts/public-check.ts", "bun.lock"]);

export function findLeaks(text: string, deny: RegExp[] = denyTerms()): string[] {
  const hits: string[] = [];
  for (const [label, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (label === "email address" && ALLOWED_EMAIL.test(m[0])) continue;
      hits.push(`${label}: ${m[0]}`);
    }
  }
  for (const re of deny) for (const m of text.matchAll(re)) hits.push(`deny-list term: ${m[0]}`);
  return hits;
}

function git(args: string[]): string {
  const p = Bun.spawnSync(["git", ...args], { cwd: ROOT });
  return p.stdout.toString();
}

function check(): number {
  const argv = process.argv.slice(2);
  const deny = denyTerms();
  const problems: string[] = [];

  if (argv[0] === "--msg") {
    // Commit trailers carry the session link and co-author, which are meant to be public.
    const msg = readFileSync(argv[1]!, "utf8").replace(/^(Co-Authored-By|Claude-Session):.*$/gim, "");
    for (const h of findLeaks(msg, deny)) problems.push(`commit message: ${h}`);
  } else {
    const files = (argv[0] === "--all" ? git(["ls-files"]) : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]))
      .split("\n")
      .filter((f) => f && !SKIP.has(f));
    for (const f of files) {
      const content = argv[0] === "--all" ? readFileSync(join(ROOT, f), "utf8") : git(["show", `:${f}`]);
      if (content.includes("\0")) continue;
      for (const h of findLeaks(content, deny)) problems.push(`${f}: ${h}`);
    }
  }

  if (problems.length) {
    console.error("public-check: blocked, this would publish local details:\n  " + problems.join("\n  "));
    return 1;
  }
  return 0;
}

if (import.meta.main) process.exit(check());
