---
title: '成功接管过期 lease 和 lock 仍以告警样式显示'
severity: 'minor'
target: 'niceeval'
---

## Expected Behavior

过期的 gate lease / case lock 被新 run 成功接管时，应显示为恢复信息，例如 i lease-recovered，并明确写出不会阻断当前 run。只有接管失败或仍被有效 owner 持有时才用告警或错误样式。

## Current Behavior

强杀后的同命令续跑会输出多条 gate-lease-taken-over 和 lock-taken-over。文案说明 heartbeat expired 且 this run now owns，表示接管已成功，但统一的 ! 样式与随后真正的 sandbox-stop-failed / mempal-checkpoint-save-failed 混在一起。用户因此自然判断锁没有过期、运行因锁报错，而实际 run 已经取得 lease/lock，后续中断来自别处。

## Possible Solution

把成功 takeover 降为 info/recovery event；在 PLAN 后合并摘要为 recovered N expired leases/locks。最终 interrupted/failed 摘要应单独列出导致退出的首要原因，并把 cleanup diagnostics 标成 secondary。

## Minimal Reproducible Example

1. 启动一个会取得 experiment gate lease 和 case lock 的长 run。
2. 对进程执行 SIGKILL。
3. 等 heartbeat lease 过期。
4. 重跑同一命令。
5. 观察成功 takeover 仍以 ! 告警样式逐条打印。

## Context

MemoryBench 执行 pnpm exec niceeval exp compare/codex 时恢复上次 killed run。日志中明确写了 heartbeat expired 与 this run now owns，但用户把这些行识别成当前故障。
