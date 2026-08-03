#!/usr/bin/env node

/**
 * One-off schema 14 -> 15 migration for the two explicitly approved compare
 * experiments.  Run with --audit before --migrate.
 *
 * schema 15's breaking data change is the required `checked` fact on every
 * commands.json entry.  The old timing node's `failed` bit is deliberately not
 * used as that fact: the schema-14 runner marked every non-zero command failed,
 * including unchecked adapter probes.  The command inventory below is narrow
 * enough to prove the public call site for every historical command in scope;
 * an unknown command stops the migration rather than guessing.
 */

import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const root = process.cwd();
const OLD_SCHEMA = 14;
const NEW_SCHEMA = 15;
const TARGETS = new Map([
  ["compare/codex-gpt-5.6-luna", ".niceeval/compare_codex-gpt-5.6-luna"],
  ["compare/codex-gpt-5.6-luna--mempal", ".niceeval/compare_codex-gpt-5.6-luna--mempal"],
]);

const OLD_COMMAND_KEYS = ["display", "exitCode", "phase", "stderr", "stdout", "timingNodeId"].sort();
const NEW_COMMAND_KEYS = ["checked", "display", "exitCode", "phase", "stderr", "stdout", "timingNodeId"].sort();
const SKILL_EXCLUDE_DISPLAYS = new Set([
  "test -d .git && mkdir -p .git/info && printf '%s\\n' '.agents/skills/' >> .git/info/exclude",
  "test -d .git && mkdir -p .git/info && printf '%s\\n' 'AGENTS.md' >> .git/info/exclude",
]);
const CODEX_SEND_PREFIX = '$(if [ -x "$HOME/.local/bin/codex" ]; then echo "$HOME/.local/bin/codex"; else command -v \'codex\'; fi) exec';
const YARN_INSTALL_DISPLAY = "npm install -g --prefix /usr/local yarn@1.22.22 && yarn install --ignore-scripts --ignore-engines";

const mode = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
if (mode.length !== 1 || !["--audit", "--migrate"].includes(mode[0])) {
  console.error("usage: node scripts/migrate-compare-schema15.mjs --audit|--migrate");
  process.exit(2);
}
const migrate = mode[0] === "--migrate";

const fail = (message) => {
  throw new Error(`schema14→15 migration aborted: ${message}`);
};

const abs = (rel) => join(root, rel);
const relPath = (path) => relative(root, path).split(sep).join("/");

async function allFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await allFiles(path)));
    else files.push(path);
  }
  return files;
}

async function json(rel) {
  try {
    return JSON.parse(await readFile(abs(rel), "utf8"));
  } catch (error) {
    fail(`${rel}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function timingNodes(phases) {
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.id === "string" && typeof node.key === "string") nodes.push(node);
    if (Array.isArray(node.children)) for (const child of node.children) visit(child);
  };
  if (Array.isArray(phases)) {
    for (const phase of phases) {
      if (Array.isArray(phase?.children)) for (const child of phase.children) visit(child);
    }
  }
  return nodes;
}

function exactKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : null;
}

function isNonZeroInteger(value) {
  return Number.isInteger(value) && value !== 0;
}

function deriveChecked(entry, commandRel) {
  if (entry.phase === "agent.setup" && SKILL_EXCLUDE_DISPLAYS.has(entry.display)) {
    return {
      checked: false,
      rule: "adapter.skills.excludeFromDiff uses unchecked sandbox.runShell().catch()",
    };
  }
  if (entry.phase === "agent.run" && entry.display.startsWith(CODEX_SEND_PREFIX)) {
    return {
      checked: false,
      rule: "codex adapter send uses unchecked sb.runShell()",
    };
  }
  if (entry.phase === "eval.run" && entry.display === "bash tests/run-tests.sh") {
    return {
      checked: false,
      rule: "eval test harness uses ordinary sandbox.runCommand(), even when t.check() consumes its result",
    };
  }
  if (entry.phase === "eval.run" && entry.display === YARN_INSTALL_DISPLAY) {
    return {
      checked: false,
      rule: "eval setup uses ordinary sandbox.runShell(), then interprets exitCode itself",
    };
  }
  fail(`${commandRel}: no reliable checked/unchecked call-site rule for ${entry.phase} ${JSON.stringify(entry.display)}`);
}

function findRunDir(runFiles, path) {
  const matches = runFiles.filter((runFile) => path.startsWith(`${dirname(runFile)}/`));
  if (matches.length !== 1) fail(`${relPath(path)}: expected exactly one owning Run, found ${matches.length}`);
  return dirname(matches[0]);
}

function evalIdFromAttempt(runDir, attemptDir) {
  const rel = relative(runDir, attemptDir).split(sep).join("/");
  const match = rel.match(/^(.+)\/a\d+$/);
  if (!match) fail(`${relPath(attemptDir)}: not an eval attempt directory`);
  return match[1];
}

async function readRunInventory(experimentId, rootRel) {
  const rootAbs = abs(rootRel);
  const files = await allFiles(rootAbs);
  const runFiles = files.filter((path) => path.endsWith("/run.json")).sort();
  if (!runFiles.length) fail(`${rootRel}: no Run directories found`);

  const runs = [];
  const runIds = new Set();
  for (const runFile of runFiles) {
    const runDir = dirname(runFile);
    const run = JSON.parse(await readFile(runFile, "utf8"));
    if (run.format !== "niceeval.results") fail(`${relPath(runFile)}: unexpected format`);
    if (![OLD_SCHEMA, NEW_SCHEMA].includes(run.schemaVersion)) {
      fail(`${relPath(runFile)}: expected schemaVersion ${OLD_SCHEMA} or ${NEW_SCHEMA}, got ${String(run.schemaVersion)}`);
    }
    if (run.experimentId !== experimentId) fail(`${relPath(runFile)}: experimentId mismatch ${JSON.stringify(run.experimentId)}`);
    if (typeof run.runId !== "string" || !run.runId) fail(`${relPath(runFile)}: missing runId`);
    if (runIds.has(run.runId)) fail(`${relPath(runFile)}: duplicate runId ${run.runId}`);
    runIds.add(run.runId);
    if (typeof run.startedAt !== "string") fail(`${relPath(runFile)}: missing startedAt`);
    runs.push({ experimentId, runFile, runDir, run, files });
  }
  return runs;
}

async function inspectRun(record) {
  const { runFile, runDir, run, files } = record;
  const filesInRun = files.filter((path) => path.startsWith(`${runDir}/`));
  const resultFiles = filesInRun.filter((path) => path.endsWith("/result.json")).sort();
  const commandFiles = filesInRun.filter((path) => path.endsWith("/commands.json")).sort();
  const resultByAttempt = new Map();
  for (const resultFile of resultFiles) {
    const attemptDir = dirname(resultFile);
    const result = JSON.parse(await readFile(resultFile, "utf8"));
    if (typeof result.locatorRunId !== "string" || !result.locatorRunId) {
      fail(`${relPath(resultFile)}: missing locatorRunId`);
    }
    if (result.artifactBase !== undefined && typeof result.artifactBase !== "string") {
      fail(`${relPath(resultFile)}: carried artifactBase is not a string`);
    }
    if (result.artifactBase === undefined && result.locatorRunId !== run.runId) {
      fail(`${relPath(resultFile)}: fresh result locatorRunId ${result.locatorRunId} does not match runId ${run.runId}`);
    }
    const evalId = evalIdFromAttempt(runDir, attemptDir);
    resultByAttempt.set(attemptDir, { evalId, result, resultFile });
  }

  const writes = [];
  const commandRows = [];
  for (const commandFile of commandFiles) {
    const attemptDir = dirname(commandFile);
    const resultInfo = resultByAttempt.get(attemptDir);
    if (!resultInfo) fail(`${relPath(commandFile)}: missing sibling result.json`);
    const { evalId, result, resultFile } = resultInfo;
    if (!Array.isArray(result.artifacts) || !result.artifacts.includes("commands")) {
      fail(`${relPath(commandFile)}: sibling ${relPath(resultFile)} does not declare commands artifact`);
    }
    const entries = JSON.parse(await readFile(commandFile, "utf8"));
    if (!Array.isArray(entries) || entries.length === 0) fail(`${relPath(commandFile)}: commands artifact must be a non-empty array`);

    const nodes = timingNodes(result.phases);
    const byId = new Map();
    for (const node of nodes) {
      const previous = byId.get(node.id) ?? [];
      previous.push(node);
      byId.set(node.id, previous);
    }
    const seenIds = new Set();
    const migratedEntries = [];
    for (const [index, entry] of entries.entries()) {
      const item = `${relPath(commandFile)}[${index}]`;
      const expectedKeys = run.schemaVersion === OLD_SCHEMA ? OLD_COMMAND_KEYS : NEW_COMMAND_KEYS;
      if (JSON.stringify(exactKeys(entry)) !== JSON.stringify(expectedKeys)) {
        fail(`${item}: unexpected fields ${JSON.stringify(exactKeys(entry))}; refusing to guess checked`);
      }
      if (typeof entry.timingNodeId !== "string" || seenIds.has(entry.timingNodeId)) {
        fail(`${item}: timingNodeId is missing or duplicated`);
      }
      seenIds.add(entry.timingNodeId);
      if (typeof entry.phase !== "string" || typeof entry.display !== "string" ||
          typeof entry.stdout !== "string" || typeof entry.stderr !== "string" ||
          !isNonZeroInteger(entry.exitCode)) {
        fail(`${item}: invalid command fact types or zero/non-integer exitCode`);
      }
      const matches = byId.get(entry.timingNodeId) ?? [];
      if (matches.length !== 1) fail(`${item}: timingNodeId ${entry.timingNodeId} resolves to ${matches.length} timing nodes`);
      const node = matches[0];
      if (node.key !== "sandbox.command" || !node.command ||
          node.command.display !== entry.display || node.command.exitCode !== entry.exitCode) {
        fail(`${item}: timing node association/display/exitCode mismatch`);
      }
      if (run.schemaVersion === OLD_SCHEMA) {
        if (node.failed !== true) fail(`${item}: old non-zero command node is not failed=true; cannot safely classify`);
        if (Object.hasOwn(node.command, "checked")) fail(`${item}: schema14 timing node unexpectedly already has checked`);
        const derived = deriveChecked(entry, relPath(commandFile));
        migratedEntries.push({
          timingNodeId: entry.timingNodeId,
          phase: entry.phase,
          display: entry.display,
          exitCode: entry.exitCode,
          checked: derived.checked,
          stdout: entry.stdout,
          stderr: entry.stderr,
        });
        commandRows.push({
          commandFile: relPath(commandFile),
          runId: run.runId,
          schemaBefore: run.schemaVersion,
          evalId,
          index,
          timingNodeId: entry.timingNodeId,
          timingNodeFailed: node.failed === true,
          checked: derived.checked,
          rule: derived.rule,
        });
      } else {
        if (typeof entry.checked !== "boolean") fail(`${item}: schema15 checked is not boolean`);
        const derived = deriveChecked(entry, relPath(commandFile));
        if (entry.checked !== derived.checked) {
          fail(`${item}: schema15 checked=${String(entry.checked)} disagrees with the explicit call-site rule (${derived.rule})`);
        }
        commandRows.push({
          commandFile: relPath(commandFile),
          runId: run.runId,
          schemaBefore: run.schemaVersion,
          evalId,
          index,
          timingNodeId: entry.timingNodeId,
          timingNodeFailed: node.failed === true,
          checked: entry.checked,
          rule: `${derived.rule}; already schema15, validated without rewrite`,
        });
      }
    }
    if (run.schemaVersion === OLD_SCHEMA) {
      writes.push({
        rel: relPath(commandFile),
        content: JSON.stringify(migratedEntries),
      });
    }
  }

  let runWrite;
  if (run.schemaVersion === OLD_SCHEMA) {
    const runText = await readFile(runFile, "utf8");
    const occurrences = runText.match(/"schemaVersion"\s*:\s*14/g)?.length ?? 0;
    if (occurrences !== 1) fail(`${relPath(runFile)}: expected exactly one schemaVersion 14 field, found ${occurrences}`);
    runWrite = runText.replace(/("schemaVersion"\s*:\s*)14/, "$1" + NEW_SCHEMA);
    const parsed = JSON.parse(runWrite);
    if (parsed.schemaVersion !== NEW_SCHEMA || parsed.runId !== run.runId || parsed.experimentId !== run.experimentId) {
      fail(`${relPath(runFile)}: generated schema15 run header failed invariant check`);
    }
    writes.push({ rel: relPath(runFile), content: runWrite });
  }

  return {
    runFile: relPath(runFile),
    runId: run.runId,
    schemaBefore: run.schemaVersion,
    resultFiles: resultFiles.length,
    commandFiles: commandFiles.length,
    commandEntries: commandRows.length,
    commandRows,
    writes,
  };
}

async function atomicBatch(writes) {
  const staged = [];
  try {
    for (const [index, item] of writes.entries()) {
      const target = abs(item.rel);
      const temp = `${target}.schema15-migration-${process.pid}-${index}.tmp`;
      await writeFile(temp, item.content, { encoding: "utf8", flag: "wx" });
      staged.push({ temp, target });
    }
  } catch (error) {
    await Promise.all(staged.map(({ temp }) => unlink(temp).catch(() => undefined)));
    throw error;
  }
  try {
    for (const { temp, target } of staged) await rename(temp, target);
  } catch (error) {
    await Promise.all(staged.map(({ temp }) => unlink(temp).catch(() => undefined)));
    throw error;
  }
}

async function main() {
  const all = [];
  for (const [experimentId, rootRel] of TARGETS) {
    all.push(...(await readRunInventory(experimentId, rootRel)));
  }
  const inspected = [];
  for (const run of all) inspected.push(await inspectRun(run));

  const byExperiment = new Map();
  for (const item of inspected) {
    const key = item.runFile.split("/")[1].replaceAll("_", "/");
    const current = byExperiment.get(key) ?? { runs: 0, schema14: 0, schema15: 0, commandFiles: 0, commandEntries: 0, writes: 0 };
    current.runs += 1;
    current[`schema${item.schemaBefore}`] += 1;
    current.commandFiles += item.commandFiles;
    current.commandEntries += item.commandEntries;
    current.writes += item.writes.length;
    byExperiment.set(key, current);
  }

  console.log(`${migrate ? "preflight" : "audit"}: exact experiment roots only`);
  for (const [experimentId, summary] of byExperiment) console.log(`${experimentId} ${JSON.stringify(summary)}`);
  for (const item of inspected) {
    if (item.schemaBefore === OLD_SCHEMA) {
      console.log(`run ${item.runId} schema ${item.schemaBefore}->${NEW_SCHEMA} ${item.runFile} results=${item.resultFiles} commands=${item.commandEntries}`);
    }
    for (const row of item.commandRows) {
      if (row.schemaBefore === OLD_SCHEMA) {
        console.log(`command ${row.commandFile}[${row.index}] runId=${row.runId} schema=${row.schemaBefore} timingNode=${row.timingNodeId} node.failed=${row.timingNodeFailed} checked=${row.checked} rule=${row.rule}`);
      }
    }
  }

  if (!migrate) {
    console.log("audit passed; no files changed");
    return;
  }
  const writes = inspected.flatMap((item) => item.writes);
  if (!writes.length) fail("no schema14 Run requires migration");
  await atomicBatch(writes);
  console.log(`migrated ${inspected.filter((item) => item.schemaBefore === OLD_SCHEMA).length} Runs and ${writes.length - inspected.filter((item) => item.schemaBefore === OLD_SCHEMA).length} command artifacts atomically`);
  console.log("post-write validation: rerun --audit");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
