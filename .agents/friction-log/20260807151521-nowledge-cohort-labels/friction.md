---
title: 'NOWLEDGE_COHORT labels results but does not isolate remote memories'
severity: 'major'
---

### Expected Behavior

A longitudinal memory experiment can select a fresh cohort whose reads and writes are isolated from all prior experiment histories.

### Current Behavior

`nowledgeFlags()` puts `NOWLEDGE_COHORT` into flags/fingerprints and attempt facts, but `nowledgeAttachRemote()` always connects the client to the same remote default Space. Changing the cohort label therefore changes result identity without changing the memory corpus. A new Signalbox trajectory cannot safely add a Nowledge cell without inheriting unrelated historical memories.

### Possible Solution

Make cohort resolve to a real provider namespace/Space and configure every memory read/write for that namespace. Fail experiment setup if the requested namespace cannot be created or selected; do not treat a label-only cohort as isolation.

### Minimal Reproducible Example

1. Run any Nowledge experiment with `NOWLEDGE_COHORT=first` and add a unique memory.
2. Run a second experiment against the same endpoint with `NOWLEDGE_COHORT=second`.
3. Search from the second run: the first cohort memory remains visible because both clients use the default Space.

Relevant code: `experiments/shared/nowledge.ts` (`nowledgeFlags`, `nowledgeAttachRemote`).

### Context

This blocked adding Nowledge to `experiments/compare/signalbox/`: the benchmark measures update, conflict, and forgetting across a replayable history, so an unknown starting corpus invalidates attribution.
