// Needs a running stack (`sbomer setup`) with vuln mirrors populated. Each issue from the week of
// 2026-10-19 that sbomer can see gets an expectation here; stage 2 adds PHP, Node and GitLab.
import { expect, test } from "bun:test";
import * as dt from "../../src/dt";

const PROJECT = "sbomer/fixtures/canary";
const version = Bun.spawnSync(["git", "rev-parse", "HEAD"]).stdout.toString().trim();

test("stage 1: Python Brotli 1.0.7 is flagged (CVE-2020-8927)", async () => {
  const p = await dt.lookupProject(PROJECT, version);
  await dt.analyze(p.uuid);
  let hits: dt.Finding[] = [];
  for (let i = 0; i < 60 && hits.length === 0; i++) {
    hits = (await dt.findings(p.uuid)).filter((f) => f.component.name.toLowerCase() === "brotli");
    if (hits.length === 0) await Bun.sleep(2000);
  }
  const ids = hits.map((f) => f.vulnerability.vulnId);
  expect(ids.some((id) => id === "CVE-2020-8927" || id.startsWith("GHSA-") || id.startsWith("PYSEC-"))).toBe(true);
}, 150_000);

test("stage 2: PHP 8.1.0 from the canary Dockerfile is flagged for the 2026-10-21 RCEs", async () => {
  const p = await dt.lookupProject(PROJECT, version);
  await dt.analyze(p.uuid);
  let ids: string[] = [];
  for (let i = 0; i < 60 && !ids.includes("CVE-2026-109618"); i++) {
    ids = (await dt.findings(p.uuid)).filter((f) => f.component.name === "php").map((f) => f.vulnerability.vulnId);
    if (!ids.includes("CVE-2026-109618")) await Bun.sleep(2000);
  }
  expect(ids).toContain("CVE-2026-109618");
  expect(ids).toContain("CVE-2026-109619");
}, 150_000);
