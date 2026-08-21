---
title: '完成全部 attempts 后 runner-record-attempt-unsealed 导致整个 Run 不可审计'
severity: 'major'
target: 'niceeval'
---

## 现象

在 MemoryBench 使用本地 NiceEval 提交快照 `cf37e1e4` 执行：

```sh
pnpm exec niceeval exp compare/codex-remem
```

CLI 完成全部 36 attempts，终态显示 `27 passed · 1 failed · 4 errored · 4 skipped`、wall time `19m54s`、约 `$0.035`，随后退出码 1：

```text
niceeval error: runner-record-attempt-unsealed
{
  "code": "runner-record-attempt-unsealed",
  "slotId": "slot-8572b05bca131c45c398b1acfe94d80f4e80b6d59a2f26e9b93bd2221db3d4f4"
}
```

运行没有打印 Run ID。`pnpm --silent niceeval show --experiment compare/codex-remem` 随后报 `report-page-execution-failed: Cannot read properties of undefined (reading comparison)`；运行时打印的 5 个失败 locator 均被 `show @<locator>` 报为不在 selected Record。

## 影响

付费批次已经完整执行，但没有可审计的已发布 Run，失败正文也无法通过公开 CLI 下钻；无法安全判定哪些结果能沿用，重跑会产生额外成本。

## 期望

Runner 应在所有 attempt 终态后原子发布 Run；若发现 unsealed attempt，应在调度结束前明确标出对应 eval/attempt、保持其余 sealed attempts 可审计，并提供恢复或续封入口。
