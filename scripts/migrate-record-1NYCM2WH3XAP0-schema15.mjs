#!/usr/bin/env node

import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const runRel = ".niceeval/compare_codex-gpt-5.6-luna--mempal/2026-08-03T05-45-21-979Z-rz4i";
const targetRel = `${runRel}/toggl-cli/01-entry-stats/a0/result.json`;
const commandRels = [
  `${runRel}/react-datepicker/pr-6206/a0/commands.json`,
  `${runRel}/toggl-cli/04-billing-doc/a0/commands.json`,
].sort();
const setupDisplay = "test -d .git && mkdir -p .git/info && printf '%s\\n' ";
const commandKeys = ["display", "exitCode", "phase", "stderr", "stdout", "timingNodeId"].sort();

const fail = (message) => {
  throw new Error(`schema14→15 migration aborted: ${message}`);
};

const abs = (rel) => join(root, rel);

async function json(rel) {
  try {
    return JSON.parse(await readFile(abs(rel), "utf8"));
  } catch (error) {
    fail(`${rel}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function filesUnder(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

function relativePath(path) {
  return relative(root, path).split(sep).join("/");
}

async function atomicReplace(rel, content) {
  const target = abs(rel);
  const temp = `${target}.schema15-migration-${process.pid}.tmp`;
  await writeFile(temp, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

const runJsonRel = `${runRel}/run.json`;
const runText = await readFile(abs(runJsonRel), "utf8");
const run = JSON.parse(runText);
if (run.format !== "niceeval.results") fail(`${runJsonRel}: unexpected format`);
if (run.schemaVersion !== 14) fail(`${runJsonRel}: expected schemaVersion 14, got ${String(run.schemaVersion)}`);
if (run.runId !== "755ff83d-d6bf-4e6a-96a9-f9cd7c3e1d82") fail(`${runJsonRel}: unexpected runId`);
if (run.experimentId !== "compare/codex-gpt-5.6-luna--mempal") fail(`${runJsonRel}: unexpected experimentId`);

const target = await json(targetRel);
if (target.locator !== "@1NYCM2WH3XAP0") fail(`${targetRel}: target locator mismatch`);
if (target.locatorRunId !== run.runId) fail(`${targetRel}: locatorRunId does not match runId`);
if (Object.hasOwn(target, "coverage") || !Object.hasOwn(target, "evidenceCoverage")) {
  fail(`${targetRel}: schema14 evidenceCoverage shape is not present`);
}

const actualCommandRels = (await filesUnder(abs(runRel)))
  .filter((path) => path.endsWith("/commands.json"))
  .map(relativePath)
  .sort();
if (JSON.stringify(actualCommandRels) !== JSON.stringify(commandRels)) {
  fail(`command artifact inventory changed; expected ${JSON.stringify(commandRels)}, got ${JSON.stringify(actualCommandRels)}`);
}

const commandWrites = [];
for (const rel of commandRels) {
  const entries = await json(rel);
  if (!Array.isArray(entries) || entries.length !== 2) fail(`${rel}: expected exactly two command exits`);
  const result = await json(`${rel.slice(0, -"commands.json".length)}result.json`);
  if (!Array.isArray(result.artifacts) || !result.artifacts.includes("commands")) {
    fail(`${rel}: result.json does not declare the commands artifact`);
  }
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`${rel}[${index}]: not an object`);
    if (JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify(commandKeys)) {
      fail(`${rel}[${index}]: unexpected fields; refusing to guess checked`);
    }
    if (entry.phase !== "agent.setup" || entry.exitCode !== 1 || typeof entry.display !== "string" ||
        !entry.display.startsWith(setupDisplay) || typeof entry.stdout !== "string" || typeof entry.stderr !== "string") {
      fail(`${rel}[${index}]: not the known unchecked skills setup command`);
    }
    if (entry.timingNodeId !== (index === 0 ? "n9" : "n11")) {
      fail(`${rel}[${index}]: unexpected timingNodeId`);
    }
  }
  commandWrites.push({
    rel,
    content: JSON.stringify(entries.map((entry) => ({
      timingNodeId: entry.timingNodeId,
      phase: entry.phase,
      display: entry.display,
      exitCode: entry.exitCode,
      checked: false,
      stdout: entry.stdout,
      stderr: entry.stderr,
    }))),
  });
}

const schema14 = runText.match(/"schemaVersion"\s*:\s*14/g);
if (schema14?.length !== 1) fail(`${runJsonRel}: expected one schemaVersion field to update`);
const runWrite = runText.replace(/("schemaVersion"\s*:\s*)14/, "$1" + "15");
if (JSON.parse(runWrite).schemaVersion !== 15) fail(`${runJsonRel}: generated schema15 text did not parse as 15`);

for (const { rel, content } of commandWrites) await atomicReplace(rel, content);
await atomicReplace(runJsonRel, runWrite);

if ((await json(runJsonRel)).schemaVersion !== 15) fail(`${runJsonRel}: post-write schema check failed`);
for (const rel of commandRels) {
  const entries = await json(rel);
  for (const [index, entry] of entries.entries()) {
    if (entry.checked !== false || Object.hasOwn(entry, "classification")) {
      fail(`${rel}[${index}]: post-write command fact check failed`);
    }
  }
}

console.log(`migrated ${runRel}: schemaVersion 14 → 15`);
console.log(`updated ${commandRels.length} commands.json files; all 4 command facts are checked=false; no classification stored`);
