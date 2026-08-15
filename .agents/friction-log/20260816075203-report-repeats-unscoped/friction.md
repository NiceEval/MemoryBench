---
title: 'Report repeats unscoped file-changes validation errors for historical records'
severity: 'major'
target: 'CorrectRoadH/niceeval'
---

## Expected Behavior

A report opened with historical record data should either accept supported older `file-changes` inputs, migrate them, or present one actionable, scoped compatibility diagnostic.

## Current Behavior

MemoryBench records last run on 2026-08-15 render with the locally linked NiceEval commit `664408c` from 2026-08-16. `niceeval view` displays 288 identical `analysis-input-invalid — file-changes is invalid` rows in the Problems sidebar. The report otherwise renders results, but the repeated messages neither identify an attempt nor explain which historical shape is invalid.

## Possible Solution

Version and migrate the analysis input, or make the file-changes analyzer backward-compatible. If a record is truly unsupported, aggregate repeated errors and attach the affected locator/run plus expected schema/version and a recovery path.

## Minimal Reproducible Example

1. Use MemoryBench record data last written on 2026-08-15.
2. Link NiceEval at commit `664408c3c2c9e8161184efcb3d9cee36dba394e2` (2026-08-16).
3. Run `pnpm exec niceeval view`.
4. Observe the rendered Problems sidebar contains 288 `file-changes is invalid` entries.

## Context

The affected record contains 146 selected attempts, so the messages appear to be report analysis input compatibility failures rather than individual evaluation failures.
