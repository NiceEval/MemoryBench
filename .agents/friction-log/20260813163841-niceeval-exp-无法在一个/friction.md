---
title: 'niceeval exp 无法在一个 run 精确选择多个离散实验'
severity: 'major'
target: 'niceeval'
---

`niceeval exp` 应允许一次 run 精确选择多个离散 experiment id，并让它们共享同一个全局并发闸与 Record writer。例如本次需要同时运行 Codex baseline、Mempal、Obelisk、Remem 和 bub baseline，但明确排除 Nowledge、Claude 与 signalbox。

## Current Behavior

`niceeval exp` 只有一个 experiment/path 位置参数；其余位置参数只会被解释成 eval id 前缀，没有可重复的 `--experiment`、显式 include 列表或 exclude。用共同前缀 `compare` 会额外选中 Nowledge、Claude 和 signalbox，不能表达目标集合。于是只能分别启动多个进程；第一个进程取得 Record writer 后，其余进程立即失败：

```
niceeval error: RecordWriterBusy: { "code": "record-writer-busy" }
```

错误没有说明当前 writer、如何等待，或怎样把多个实验合并到一个 run。多进程即使绕过 writer，也会让每个进程各自拥有 `maxConcurrency`，失去仓库所需的账号级全局并发控制。

## Possible Solution

为 `niceeval exp` 增加可重复的 `--experiment <id>`，或 `--include-experiment` / `--exclude-experiment`，把所有选中实验组成一个 run，由同一个 Record writer 与全局 semaphore 调度。对 `RecordWriterBusy` 补充持锁 run/process 信息和推荐命令；若产品希望自动串行等待，也应明确提供 `--wait-for-writer`。

## Minimal Reproducible Example

终端 A：

```sh
pnpm --silent niceeval exp compare/codex-gpt-5.6-luna --max-concurrency 1
```

终端 B 在 A 运行期间：

```sh
pnpm --silent niceeval exp compare/bub-gpt-5.6-luna --max-concurrency 1
```

终端 B 立即得到 `RecordWriterBusy`。而 `pnpm --silent niceeval exp compare` 会错误扩大到本次明确排除的实验。

## Context

MemoryBench 需要运行 5 个正式 compare 实验、排除依赖远程服务的 Nowledge。dry plan 共 180 个槽位，实际 143 条需执行。缺少离散多实验选择意味着要么误跑付费实验，要么把 5 个实验完全串行，显著增加墙钟时间；手工多进程又同时破坏 Record 单写者和全局代理并发闸。
