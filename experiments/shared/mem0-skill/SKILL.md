---
name: mem0-memory
description: Search and record durable engineering knowledge with Mem0 MCP tools, before and after coding work.
---

# Mem0 memory protocol for this eval

This environment has a persistent Mem0 memory store (remote MCP server `mem0`) that survives
across tasks. Use the MCP tools — do not shell out to a local CLI unless the tools are missing.

## 1. Search before you start

Call `search_memories` once at the start with the task's key terms (framework, API, error
message, symptom). Pass `user_id` if the tool requires it (use the default user already
configured for this session).

Empty results are normal — continue with the task. Treat any hit as evidence, not authority:
verify it against the current repository before acting on it.

## 2. Record before you finish

If the work produced a durable engineering decision or a reusable debugging lesson, call
`add_memory` with a short summary (2–5 sentences: what was decided or learned, and why).

Only search + add are required for this eval. Skip bulk delete / entity admin tools unless the
user explicitly asks.

## What not to store

Never store benchmark answers, accepted proposal numbers, hidden-test guesses, raw transcripts,
or task-specific output that would reveal the answer if the same task is run again. Record the
reusable *why*, not the answer. If nothing reusable was decided, do not invent a memory.
