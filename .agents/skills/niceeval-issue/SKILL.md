---
name: niceeval-issue
description: 将从 NiceEval 公开入口或 NiceEval-owned 文档、工具与官方集成观察到、且仍需 NiceEval maintainer 处理的摩擦脱敏、查重并在获当次授权后提交到 NiceEval/NiceEval；也用于安全重试和 Issue URL 交接。
---

# NiceEval Issue

把可复现且仍由 NiceEval 负责的摩擦交给 `NiceEval/NiceEval` 的公开 Issue；安全问题改走该仓库的 Private Vulnerability Reporting。公开 Issue URL 是长期 owner，本仓库不保留镜像日志。

## 边界

- 先判定 owner：MemoryBench 自己的指南、评估用例、实验配置、脚本和 workaround 在本仓库修；第三方服务或依赖的问题交给其 canonical upstream。只有 NiceEval 公开行为、随包文档、官方 Adapter 或官方工具仍需 NiceEval maintainer 处理时，才进入本流程。
- NiceEval-owned 问题先停止当前受阻工作并向用户指出，不要在保留 Observation 和取得 Issue owner 前用 workaround 掩盖 NiceEval DX；已取得 owner 且继续工作不掩盖证据时可以 fix-forward。
- 保留原始 Observation：只陈述实际行为、命令/输入、结果与影响。根因、责任归属和修复方向未经验证时写成“可能”或“建议”，不能冒充事实。
- 远端 mutation（创建/评论 Issue、修改 label、提交 private report）前，必须取得用户对本次操作的明确授权。历史授权、项目规则和本地草稿不算授权；只读查询不需要 mutation 授权。
- 不公开 token、secret、凭据、私有 endpoint、个人信息、绝对本机路径、未公开源码或不必要的私有运行数据。疑似漏洞或无法安全脱敏时停止公开流程，只向用户说明应使用 `https://github.com/NiceEval/NiceEval/security/advisories/new`。

## 查重与分类

1. 用 GitHub API 分页枚举 `NiceEval/NiceEval` 的 open + closed Issues（排除 Pull Requests），在本地搜索相关标题和正文。语义相同的已有 Issue 即为 owner；返回其 URL，不创建新 Issue。不要只搜 open，也不要只依赖 GitHub 搜索索引。
2. 恰好选择一个 type：`bug`、`enhancement`、`documentation`。
3. 确认 NiceEval 仍保有责任后，恰好选择一个 area：`area:library`、`area:cli`、`area:runner`、`area:record`、`area:report`、`area:adapter`、`area:repository`、`area:dependency`。只有 NiceEval 对公开行为仍负责、但外部依赖参与或阻塞时才用 `area:dependency`；纯下游或纯第三方问题不得先投 NiceEval 再 route。
4. 新 Issue 还要加 `needs-triage`。

可用下面的只读基线取得完整候选集：

```sh
gh api --paginate \
  'repos/NiceEval/NiceEval/issues?state=all&per_page=100' \
  --jq '.[] | select(.pull_request | not) | [.number, .state, .title, (.body // ""), .html_url] | @tsv'
```

## 正文模板

标题应单行、具体、可搜索。人读正文至少包含：

```markdown
## Observation

实际观察到的行为与证据；推测必须单独标明。

## Expected behavior

可观察的期望结果。

## Reproduction

最小步骤、必要版本与公开输入。

## Impact

受影响的工作流、正确性、成本或可诊断性。

## Possible direction

可选；明确这是建议而非已确认根因。

## Source provenance

发现问题的 canonical source repository、固定 source commit、稳定来源 ID 与 repo-relative source path；不得含绝对本机路径。迁移会删除的本地记录还要在 payload/manifest 中保存同一个 `source-commit`，确保以后能从 Git snapshot 恢复原文。
```

## Machine marker 与摘要

marker 版本固定为 `niceeval.issue-origin/v1`。`origin-key` 使用带 host、全小写的 canonical source repository 与稳定来源 ID；MemoryBench 旧 Frog 记录固定为 `github.com/niceeval/memorybench#frog/<frog-id>`。

标题与不含 marker 的人读正文分别做相同 canonicalization：Unicode NFC；CRLF/CR 转 LF；删除每一行末尾的 whitespace；删除首尾空行。标题还必须是单行。按 `title`、`body` 的固定 key 顺序编码为不带额外空白的 UTF-8 compact JSON，再计算小写 hex SHA-256：

```json
{"title":"<canonical title>","body":"<canonical human-readable body>"}
```

然后在正文末尾附加且只附加一次：

```markdown
<!-- niceeval.issue-origin/v1
origin-key: <origin-key>
payload-sha256: <sha256>
-->
```

必须使用标准 JSON string escaping；不能手工拼 JSON 字节。marker block 明确排除在 `body` 和摘要输入之外，避免自引用。标题或任一人读正文字符改变后都重新计算摘要；来源 ID 体现在 marker 的 `origin-key` 中，不进入 payload digest。

## 提交与幂等重试

1. 在任何 `gh issue create` 前重新分页读取 open + closed Issue body，并按完整 marker 的 `origin-key` 本地匹配。
2. 同一 key、同一 digest：不再创建，直接返回已有 `html_url`。
3. 同一 key、不同 digest：停止并询问用户；不得覆盖、评论或另建重复 Issue。
4. 无 marker 命中且语义查重也无命中，并已取得本次明确授权时，才执行一次创建：

```sh
gh issue create --repo NiceEval/NiceEval \
  --title "$title" \
  --body-file "$body_file" \
  --label "$type" \
  --label "$area" \
  --label needs-triage
```

5. 创建结果因网络中断、超时或响应丢失而不确定时，不要盲重试：先重新分页枚举 open + closed 并按 marker 匹配。找到同 key 同 digest 就返回 URL；同 key 异 digest 就停止询问；仍未找到且原授权仍覆盖完全相同 payload 时最多重试一次，再不确定就停止并报告。
6. 成功后校验返回 URL 属于 `https://github.com/NiceEval/NiceEval/issues/`，只把该 URL 作为 owner 交接。不要在仓库保存授权、token、Issue 正文副本或状态镜像。
