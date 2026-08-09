---
title: 'niceeval view does not expose custom-report rebuild state'
severity: 'minor'
target: 'CorrectRoadH/niceeval'
---

## Expected Behavior

`niceeval view` should clearly report when a custom report has rebuilt after a source change, or serve the new report immediately.

## Current Behavior

After removing `logo` from `reports/components/memorybench-hero.tsx`, the running `niceeval view` page at port 41965 initially continued to serve the old inline SVG logo. It gave no rebuild status, stale-content indicator, or error explaining whether the report source had reloaded. A later request eventually returned the new page without the logo.

## Possible Solution

Expose report rebuild lifecycle in the terminal and/or page, such as source change detected, rebuild started/completed, and last successful report build time. If rebuilding is asynchronous, make the stale state explicit.

## Minimal Reproducible Example

1. Start `pnpm niceeval view --report reports/memory.tsx --no-open`.
2. Change the report component to remove a visible element.
3. Reload the served page immediately.
4. Observe that the old report can remain visible without any rebuild status; later requests may serve the new output.

## Context

This made it ambiguous whether the component change failed or the development viewer was still rebuilding. A fresh static export with `niceeval view --out` already omitted the element, confirming the report source was correct.
