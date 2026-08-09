---
title: 'sandbox-reuse-contamination 把有意持久化记忆标成污染嫌疑'
severity: 'minor'
target: 'niceeval'
---

## Expected Behavior

状态型 Eval Group 会有意在 workdir 外保留记忆。复用污染诊断应能识别作者声明的持久状态，或至少明确列出“有意状态”这一解释，避免把正常的记忆条件直接指向 setup 非幂等。

## Current Behavior

完整 Remem Group 运行中，`$HOME/.remem` 按设计跨 Attempt 累积，workdir reset 与 extraction queue 均正常。只因同一物理 Sandbox 的首题通过、后两题在 eval.run 产生 task gate failure，CLI 就输出 `sandbox-reuse-contamination`，并称 earlier attempt 留在 workdir 外的文件是 likely cause。这个提示不会改 verdict，但在记忆评测里会稳定把被测变量本身标成污染嫌疑。

## Possible Solution

允许 Sandbox Layer 或 Experiment 声明预期保留的路径/状态类别，让启发式排除它们；或把 warning 改为同时列出 intentional persistent state，并给出触发它的 instance、handoff 与具体可观察证据，而不是仅从 verdict 序列推断文件污染。

## Minimal Reproducible Example

运行 `pnpm --silent exec niceeval exp compare/codex-gpt-5.6-luna--remem --rerun all --max-concurrency 2`。当一个复用实例的第一题通过、随后两题 task gate 失败时，最终 summary 出现 `sandbox-reuse-contamination`；这批 Experiment 的显式目的正是保留 `$HOME/.remem`。

## Context

MemoryBench 用 Eval Group 串行验证本地记忆条件，并让不同 Group 并发。当前 warning 容易把模型能力失败误诊成复用隔离故障，尤其会干扰对 lifetime replacement 和真实状态丢失的排查。
