---
title: 'remem 安装成功但 extraction worker 未启动，记忆任务静默积压'
severity: 'major'
target: 'majiayu000/remem'
---

## 现象

在 remem 0.6.47（schema v75）+ Codex hooks/MCP 的串行 sandboxReuse 评测中，前题 Stop hook 已捕获事件，但后题完全召回不到前题规则。

## 复现证据

- 第 02 题结束：`captured=2`、`extract_todo=1`、`memories=0`、`worker_daemon.health=missing`。
- 约四分钟后的第 03 题 setup 显示 key/db 均为 `existing`，证明同一 `$HOME/.remem` 跨题保留。
- 第 03 题结束：`captured=4`、`extract_todo=2`、`memories=0`、`observations=0`、`relevance_state=unavailable`、`relevance_final_injected_count=0`、`ai_calls=0`。
- hooks.json 的 SessionStart/Stop 与 config.toml 的 MCP 注册均通过自检。

## 影响

安装表面成功且原始消息持续入库，但 extraction task 没有消费者，记忆条件静默退化成 no-memory；昂贵评测直到功能失败后才能发现。

## 期望

安装/集成流程应启动并管理 extraction worker，或明确文档化必须由调用方启动的命令；`doctor`/健康检查应在 session 开始前因 worker missing 失败，而不是只在 `status` 深层字段中暴露。
