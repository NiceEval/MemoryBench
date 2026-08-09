---
title: 'pnpm exec niceeval --json 在 link 工作流中污染 stdout'
severity: 'minor'
---

## Expected Behavior

在本地 link NiceEval 后，`pnpm exec niceeval ... --json` 的 stdout 应只包含 NiceEval JSON，能够直接管给 `jq`。

## Current Behavior

MemoryBench 的本地 link 指向 NiceEval refactor-sandbox 时，每次 `pnpm exec niceeval ... --json` 都先向 stdout 写入 `Already up to date` 和 `Done in ...`。因此 `jq` 在第 1 行第 8 列报 `Invalid numeric literal`。`pnpm --silent exec niceeval ... --json` 与 `node_modules/.bin/niceeval ... --json` 都能输出干净 JSON，说明污染来自 pnpm exec 的 link 刷新路径，不是 NiceEval renderer。

## Possible Solution

确认 pnpm 为 injected 或 linked workspace package 自动同步时为何把状态写入子命令 stdout，并提供不需要调用者额外加 `--silent` 的配置或调用约定。若这是 pnpm 固定行为，MemoryBench 文档中的机器面命令应统一使用可保证纯 stdout 的入口。

## Minimal Reproducible Example

1. 让 `node_modules/niceeval` link 到相邻 NiceEval 工作树。
2. 运行 `pnpm exec niceeval exp <experiment> <eval> --dry --json | jq .`。
3. 观察 `jq` 因 stdout 开头的 pnpm 安装状态行而失败。
4. 改用 `pnpm --silent exec niceeval ... --dry --json | jq .`，命令成功。

## Context

这会破坏 NiceEval 承诺的机器面单一 JSON stdout。当前验收用 `pnpm --silent exec` 和直接 bin 绕过，但普通人最自然的 `pnpm exec` 仍不可直接管道消费。
