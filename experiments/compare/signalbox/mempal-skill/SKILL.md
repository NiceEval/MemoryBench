---
name: signalbox-history-memory
description: 在每次 Signalbox 开发任务前检索产品历史，并在完成前记录本轮新增、更新或撤销的产品规则。
---

# Signalbox 产品历史协议

这个环境提供跨任务持久化的 Mempal 记忆库。每道题都会使用全新 sandbox 和 starter 仓库，因此不要依赖上一题写过的代码；
产品规则和决策历史应通过 `mempal` 保存与检索。

## 开始任务前：检索

根据本轮涉及的客户、功能和规则作用域，只执行一次语义检索：

```bash
mempal search "<客户、功能、优先级或作用域关键词>" --json --top-k 8
```

把命中内容视为历史证据，不是永远正确的事实。本轮 prompt 明确给出的新规则优先级最高；若它更新或撤销了旧规则，
实现时必须采用新规则。

## 完成任务前：记录演化

如果本轮建立、修改或撤销了产品规则，把它写成一份简短的中文 Markdown 决策记录，再执行一次 ingest：

```bash
cat > "$HOME/.mempal-notes/<客户>-<规则>-<状态>.md" <<'EOF'
# <客户与规则>

<当前规则、适用范围，以及它新增/替代/撤销了什么。2–6 句话。>
EOF
mempal ingest "$HOME/.mempal-notes" --wing memory-evals
```

产品规则是后续开发任务所需的持久工程上下文，应当记录。不要保存实现代码、测试输入输出、隐藏测试猜测，
也不要把整个 prompt 原样存档。没有形成或改变产品规则时，不要虚构记录。
