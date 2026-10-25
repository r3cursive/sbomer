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
