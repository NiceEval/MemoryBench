---
title: '没有官方入口可重计价历史结果的成本'
severity: 'major'
target: 'niceeval'
---

## Expected Behavior

当 provider 模型调价（如 gpt-5.6-luna 的 input / cache read / output 单价变更）后，应有一个官方路径把历史 attempt 的 `estimatedCostUSD` 按新价格表重算，不改动 verdict、token usage、execution、diff 或其它非目标数据。

## Current Behavior

没有任何 CLI 命令、flag、文档页面或公开 API 可以做这件事。`niceeval --help` 的完整命令清单只有 exp / exp rename / accept / show / view / list / session / sandbox / clean / init；`docs-site/zh/**` 全文没有 reprice / 重计价相关内容。`defineConfig({ pricing })` 只影响运行时（写入时）估算，不会回溯已落盘的 `estimatedCostUSD`。`niceeval/record` 的 `createWriter` 定位是「把别家平台的结果转成 NiceEval 格式」——新建 Run 目录、带新 producer 身份，不是修改既有 Run；用它重写全量记录会复制第二份数据且必须逐字段重建 EvalResult，任何偏差都会破坏 verdict / usage / diff，不是安全路径。`exp rename` 只 rebind experiment id，不碰成本。

## Possible Solution

新增 `niceeval reprice`（或等价迁移命令）：按 model 提供新旧价格表，遍历选中 experiment/run 的已落盘 result，仅重写成本字段（`estimatedCostUSD`，必要时含 usage 内成本），保留其余字段原样，dry-run 预览 + 变更清单。或提供 `show --usage` 的运行时价格覆盖（`--pricing <table>` 之类），让展示层按新价格实时估算而不落盘改写。

## Minimal Reproducible Example

1. `pnpm niceeval show --exp compare/codex-gpt-5.6-luna --usage --json` 可见每条 attempt 带落盘的 `estimatedCostUSD` 与 `inputTokens` / `outputTokens` / `cacheReadTokens` / `reasoningTokens`。
2. provider 调价后（新价格：uncached input $0.20/M、cache read $0.02/M、output $1.20/M），想统一核对 216 条 Luna attempt，并重算其中仍按旧价格落盘的 107 条。
3. 找不到任何官方入口；按仓库规则不得直接改 `.niceeval/` 下的 result.json，任务阻塞。

## Context

Luna 六个实验（bub / codex / codex+mempal / codex+nowledge / codex+obelisk / codex+remem，各 36 attempts）当前落盘总成本合计约 $33.75；其中 bub、obelisk、remem 的 108 条已经是新价，codex 与 mempal 的 72 条、nowledge 的 35 条仍是旧价，共 107 条待重算。全部统一后总成本应约为 $12.2542。重算只应改变成本，token 与判定必须原样。这是候选上游 feature request；在上游提供前，历史成本无法通过 CLI 更新。
