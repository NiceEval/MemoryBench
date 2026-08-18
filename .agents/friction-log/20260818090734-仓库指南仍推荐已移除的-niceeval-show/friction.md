---
title: '仓库指南仍推荐已移除的 niceeval show --exp 参数'
severity: 'minor'
target: 'CorrectRoadH/niceeval'
---

## 现象

仓库 AGENTS.md 的结果诊断表仍统一推荐 `pnpm niceeval show --exp <id>`；当前安装版本执行后直接报 `Unknown option --exp`。

## 复现

```sh
pnpm --silent niceeval show --exp compare/codex-gpt-5.6-terra--remem --history
```

当前 `niceeval show --help` 只声明 `--experiment <id>`。

## 期望

CLI 参数改名时同步更新生成/维护的项目指南；或保留 `--exp` alias 并给出迁移提示，而不是泛化的 Unknown option。
