---
title: '本地 NiceEval override 在嵌套 worktree 中解析到错误 sibling'
severity: 'minor'
---

## Expected Behavior

MemoryBench 的 NiceEval 本地联调 override 应在普通 clone 与 Herdr 的嵌套 worktree 布局中都能解析到明确的候选 checkout，或在找不到时给出可执行提示。

## Current Behavior

`pnpm-workspace.yaml` 固定 `niceeval: link:../NiceEval`。从 `/home/ctrdh/.herdr/worktrees/MemoryBench/2-0` 安装时，它解析到不存在的 `/home/ctrdh/.herdr/worktrees/MemoryBench/NiceEval`；pnpm 仍生成断开的 `node_modules/niceeval` 链接，随后 `pnpm typecheck` 产生大量 `Cannot find module niceeval`。补上目标 symlink 后再次 `pnpm install` 又因 lockfile up to date 没重建 `node_modules/.bin/niceeval`。

## Possible Solution

用仓库脚本接收显式 NiceEval checkout 路径并在安装前验证目标；不要把相对 worktree 形状编码进 workspace override。目标修复后强制刷新 link 和 bin shim。

## Minimal Reproducible Example

在 `MemoryBench/<worktree-name>` checkout 运行 `pnpm typecheck`，同时不存在 `MemoryBench/NiceEval`。观察断开的 `node_modules/niceeval -> ../../NiceEval` 和模块解析失败。

## Context

联调 Eval Group 上游 PR 时需要额外创建未提交的目录级 symlink，并改用 `node --import tsx node_modules/niceeval/bin/niceeval.js` 才能完成 dry plan。
