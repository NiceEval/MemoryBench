---
title: 'niceeval show @locator emits the full evaluation source during failure diagnosis'
severity: 'minor'
target: 'CorrectRoadH/niceeval'
---

## Expected Behavior

`niceeval show @<locator>` should present the failed assertion and its relevant execution evidence without dumping unrelated evaluation source files. A focused diagnostic view should stay bounded enough to read in a terminal or agent tool response.

## Current Behavior

On a failed MemoryBench attempt, `pnpm --silent niceeval show @12967ATDX4E4N` correctly identified two failed invoice-rule assertions, but then emitted roughly 3.4 MB of source content (including many unrelated eval definitions). This obscured the actual failure and caused the terminal response to be truncated.

## Possible Solution

Keep the default locator view focused on the selected attempt. Put source inspection behind an explicit flag/page, and include expected versus actual values for mismatched value assertions in the focused diagnostic output.

## Minimal Reproducible Example

1. In MemoryBench, run `pnpm --silent niceeval show @12967ATDX4E4N`.
2. Observe the `equals(value) did not match` assertion.
3. Observe that the command continues by rendering extensive source material unrelated to the selected failure.

## Context

MemoryBench requires result diagnosis through the NiceEval CLI rather than by reading private record artifacts; this output shape makes the supported diagnostic path impractical for failures.
