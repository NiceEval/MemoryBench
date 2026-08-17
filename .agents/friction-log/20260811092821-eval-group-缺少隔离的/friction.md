---
title: 'Eval Group 缺少隔离的 Git source cache，每题反复 clone 同一仓库'
severity: 'major'
target: 'niceeval'
---

## Expected Behavior

同一 Eval Group 的多道真实仓库题可以共享一份按内容寻址的 Git 对象缓存；每道题仍只能看到自己 base commit 及之前的历史，且上一题对 .git 的修改不能污染下一题。

## Current Behavior

MemoryBench 的 downshift、react-datepicker、react-hook-form、react-tooltip 和 yet-another-react-lightbox 题组在每个成员 .prepare() 中都先 rm -rf .git，再从 GitHub clone 同一仓库，reset 到本题 base commit，然后删除 remote/tags/reflog 并 gc 清理未来历史。单次全选就会重复 clone 30 次，attempts 大于 1 时继续倍增。简单保留 .git 又不安全：agent 可以改它，共享完整 clone 还会让早期题读到 base 之后的修复。

## Possible Solution

由 niceeval/Sandbox Provider 提供 agent 不可读写的 group-local source cache。Fixture 按精确 base commit 从缓存本地重建干净 .git，仅在缓存缺失时从远端补对象；在 agent 启动前删除后续 refs/reflog 并验证可见历史边界。这个能力不应由每个 eval 自己重写权限隔离和 Git object 缓存。

## Minimal Reproducible Example

运行选中 evals/react-hook-form/ 全组的实验，观察 8 条成员的 eval.prepare：每条都执行 git clone https://github.com/react-hook-form/react-hook-form.git，虽然它们串行复用同一 Sandbox。

## Context

在检查 Eval Group 的 Fixture 责任边界时发现。目标是减少评测墙钟时间和 GitHub 下载量，同时不破坏 SWE-bench 类任务对“不可见未来历史”的隔离。
