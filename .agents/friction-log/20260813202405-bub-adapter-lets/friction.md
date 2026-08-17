---
title: 'Bub adapter lets the transcript exceed the model context window'
severity: 'major'
target: 'niceeval'
---

The official Bub adapter ran react-tooltip/pr-1282 until the upstream model rejected the next request with HTTP 502: Your input exceeds the context window of this model. NiceEval reported agent-send-failed and no assertions ran. A single targeted retry passed, so the task and proxy were healthy. The Bub integration should compact, truncate, or enforce a token budget before sending, and should expose the configured context policy. Reproduced at attempt @6066e4db-c970-43a8-918e-c3511fd3fd88 in run 7aa5b902-56f1-4a66-b309-82fbfa4e7f51.
