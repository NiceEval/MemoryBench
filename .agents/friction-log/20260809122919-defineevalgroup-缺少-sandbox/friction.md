---
title: 'defineEvalGroup 缺少 Sandbox 生命周期与共享准备文档'
severity: 'major'
target: 'niceeval'
---

## Expected Behavior

随包 INDEX 应指向 defineEvalGroup 的参考或教程，明确 group sandbox prepare 的执行次数、它与成员 eval sandbox layer 的先后顺序、题间 reset 边界，以及哪些安装适合上移到 group。

## Current Behavior

当前 node_modules/niceeval/INDEX.md 和随包中文文档完全检索不到 defineEvalGroup。下游代码可以正常导入并类型检查该 API，但在收敛 react-hook-form 八道题重复的依赖安装时，文档无法回答 group prepare 是否只运行一次、发生在成员 checkout 之前还是之后、工作目录与全局 pnpm store 各自如何跨题保留。只能从另一个下游 eval-group.ts 的偶然用法猜测，容易把不同 lockfile 的 pnpm install 错误合并成一次，污染评测环境。

## Possible Solution

新增 defineEvalGroup 参考页和一张生命周期表，并给出公共工具链安装与成员 commit 专属依赖安装的对比例子；INDEX 收录该页。文档也应说明 group 层改动如何进入成员 eval 的 fingerprint。

## Minimal Reproducible Example

在已安装 niceeval 的项目运行：rg -n defineEvalGroup node_modules/niceeval/INDEX.md node_modules/niceeval/docs-site/zh。结果为空，但 TypeScript 中 import { defineEvalGroup } from niceeval 可以通过。

## Context

MemoryBench 的 react-hook-form group 包含八个不同 base commit；实查有三种 pnpm-lock.yaml。缺少生命周期文档会同时带来重复成本与错误共享依赖两种相反风险。
