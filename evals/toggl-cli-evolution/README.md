# toggl-cli evolution chain

这组 eval 把 [Evolving Memory Systems: An Eval-First Approach](https://linghao.io/posts/memory-systems-should-be-evolved)
提出的纵向压力落成真实 coding-agent 任务：每道题都从 `toggl-cli` 的同一个 base commit 开始，代码不会沿用，
只有记忆系统能把前序交互里的产品约定带到后续任务。

## 隐藏 profile

- 模拟用户：`northstar-ops`
- 稳定上下文：容量规划只统计已经结束的 time entries，逐条套规则后再汇总。
- 会演化的规则：规划块从 30 分钟改成 20 分钟；之后短暂允许带 `fixed` 标签的条目保留精确时长，
  最后又因为报表不一致撤销该例外。

## 轨迹与压力

| 序号 | 类型 | 本题可见信息 | 应留下/读取的状态 | 主要失败归因 |
| --- | --- | --- | --- | --- |
| 01 | learn | 完整 30 分钟规则 | 新增 `block=30m` | addition / capture |
| 02 | checkpoint | 只说“Northstar planning rule” | 读取 30 分钟规则 | retrieval |
| 03 | update | 明确用 20 分钟替换 30 分钟 | 更新为 `block=20m` | update / consolidation |
| 04 | checkpoint | 不重述分钟数 | 选择最新 20 分钟，压过旧 30 分钟 | temporal conflict |
| 05 | update | 新增 `fixed` 精确时长例外 | 保存局部覆盖，不改默认 20 分钟 | scoped update |
| 06 | checkpoint | 只说“current exceptions” | 同时读取默认值和局部例外 | composition |
| 07 | revoke | 明确撤销 `fixed` 例外 | 删除/否定例外，保留 20 分钟默认值 | forgetting |
| 08 | checkpoint | 不重述任何历史细节 | 使用 20 分钟且不再应用例外 | stale-memory suppression |

01/03/05/07 是有完整契约的学习或变更任务，同时也是普通开发能力的锚点；02/04/06/08 才是核心记忆
checkpoint。报告时不能只报全链总通过率，应至少分别给出 checkpoint trajectory，以及 update 后是否仍被旧规则污染。
效率仍用 NiceEval 的 wall time、turns、token/cost、失败命令与 retry 统计；额外检索/整理带来的成本是被测系统的一部分。

推荐同时报告四组互不混算的指标：

1. `task success`：8 道真实开发任务各自的 pass/fail 与总通过率。
2. `checkpoint survival`：按顺序列出 02/04/06/08 的二元轨迹，并给出最长连续存活到哪个 checkpoint；
   不用一个平均数抹掉“先会、更新后退化”的形状。
3. `attribution`：02=读取，04=新旧值冲突，06=默认值与局部覆盖组合，08=撤销后抑制 stale memory。
   每题的 `metadata.memoryOperation` 和 tags 可直接分组。
4. `efficiency`：每题 wall time、turns、token/cost、重复失败命令与 retries；质量相同才比较哪套记忆更便宜。

不另造“背出了某句话”式 gate，也不把四个 checkpoint 加权成貌似精确的单一分数。这里的生存信号仍是开发任务
有没有做成；纵向轨迹和资源成本负责解释为什么某个系统更值得继续演化。

## 运行约束

- 文件名前缀钉死发现顺序；有跨题记忆的 experiment 必须 `maxConcurrency: 1`，并从干净 cohort 用
  `--rerun all` 跑完整链。不要只跑一个 checkpoint 后把失败归因给记忆系统。
- 同一 experiment 不要多终端拆跑这条链，否则两个串行队列会破坏交互顺序。
- 判据只断言 prompt 或前序 prompt 公开过的命令、JSON 键和规则；实现命名、模块结构与内部 state 不入判据。
- 这是自造链式题，没有可直接套用的上游官方 patch。新增/修改判据时仍需做 RED、参考实现 GREEN、
  以及不同结构的 ALT 三向验证，并在交接中明确这一点，不能把参考实现冒充上游实现。
