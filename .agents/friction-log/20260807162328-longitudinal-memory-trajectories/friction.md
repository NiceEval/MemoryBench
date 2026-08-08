---
title: 'Longitudinal memory trajectories have no first-class ordering or checkpoint model'
severity: 'major'
target: 'niceeval'
---

### Expected Behavior

NiceEval should have a first-class longitudinal trajectory primitive that declares ordered history events, memory checkpoints, and a clean cohort identity. The dry plan and reports should show the dependency order and checkpoint survival path.

### Current Behavior

A longitudinal suite must encode order through numeric directory names plus `maxConcurrency: 1`, describe event/checkpoint roles in README and metadata, and rely on the author to run the whole prefix from a clean external-memory cohort. `niceeval exp ... --dry` renders every item as an independent attempt, so readers cannot tell why a checkpoint is intentionally under-specified or which earlier events it depends on.

### Possible Solution

Add a trajectory API that groups ordered eval steps, marks history events versus checkpoints, requires sequential scheduling, declares/reset-checks cohort identity, and reports checkpoint survival such as 02 → 05 → 07 → 09. Refuse isolated checkpoint execution unless explicitly requested as a non-comparable debug run.

### Minimal Reproducible Example

1. Define nine evals selected by one experiment with `maxConcurrency: 1`.
2. Make eval 02 depend on facts introduced by eval 01, without repeating those facts.
3. Run `niceeval exp <experiment> --dry`.
4. The plan shows two unrelated attempts and no history edge, checkpoint role, clean-cohort requirement, or warning when selecting only eval 02.

Relevant suite: `evals/signalbox/` and `experiments/compare/signalbox/`.

### Context

The benchmark compares the same coding agent with and without persistent memory while worktrees reset between tasks. The missing trajectory model makes the core experimental semantics live in prose and led directly to confusion about what is testing memory.
