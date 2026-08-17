---
title: '中止 run 后实时 attempt locator 不可追溯且错误正文丢失'
severity: 'major'
target: 'niceeval'
---

实时运行输出打印的 `@<locator>` 应始终可由 `niceeval show @<locator>` 打开；即使用户中止 run，已结束的 errored attempt 至少应保留阶段名、完整错误正文和诊断事实。若中止 run 的结果按设计不发布，CLI 也应提供明确的 interrupted-run 审计入口。

## Current Behavior

一次 36 题 run 中，第一条 attempt 已明确结束并打印：

```
✗ @f0ed2bac-78ae-442e-9c2c-7bded3b054ea downshift/pr-1414 [codex-gpt-5.6-luna] errored · sandbox…
```

调度器随即启动下一题。此时 Ctrl-C 中止 run 后：

```sh
pnpm --silent niceeval show @f0ed2bac-78ae-442e-9c2c-7bded3b054ea
```

返回 `Attempt ... was not found in the selected Record.`。实验概览只包含此前已完成发布的另一条单题 run，看不到本次中止 run 或 errored attempt。实时行的错误摘要又截断在 `sandbox…`，因此 CLI 没有任何切片能恢复错误正文。

当前 0.8 CLI 也不接受仓库既有排障文档中的 `show --history`，只报 `niceeval show does not accept --history`，没有给出替代入口。

## Possible Solution

中止 run 时原子发布已经终态化的 attempt，并把未完成 attempt 标成 interrupted；或者新增 `show --interrupted` / `show --run <id>` 的未发布审计视图。实时输出只有在 locator 已经可解析后才打印它。截断错误摘要时同时提示可用的完整错误命令。移除 `--history` 时在错误中给出迁移后的等价命令。

## Minimal Reproducible Example

1. 启动一个至少两题的 run。
2. 等第一题打印终态 locator、第二题开始运行。
3. Ctrl-C。
4. 运行 `niceeval show @<第一题 locator>`。
5. 观察 locator not found，且实验 overview 不含该中止 run。

## Context

本次为了排查 Codex baseline 的 sandbox error 按项目规则只走 CLI。由于中止 run 后 locator 消失，完整错误不可观测；读取 `.niceeval/` 或 NiceEval 实现又会掩盖 CLI 呈现缺口，因此基础设施错误无法继续诊断。
