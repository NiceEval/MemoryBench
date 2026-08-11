# Signalbox：产品规则随历史演化的记忆评估

这不是在考 agent 能否背诵一段文字，而是在比较同一模型的两种工作条件：

- no-memory：每道题都是新会话，只看到本轮需求和干净的 starter 仓库；
- Mempal：每道题也是新会话和全新 sandbox，但会在开始时恢复专属记忆 checkpoint；agent 可以检索前序产品决策，
  并在结束时把本轮决策保存进下一题使用的 checkpoint。

两组收到完全相同的中文开发任务，每一题都在全新 sandbox 中重新上传同一份 starter。因此前一题写出的实现、测试、
Git diff 以及其它环境状态都不会流入下一题；Mempal 条件只恢复自己的记忆数据。这避免把“复用了旧代码或环境”
误判成“记住了历史”。

题目模拟真实软件维护中的 SLA 规则：规则会建立、被相似客户干扰、缩小适用范围、加入合同例外，最后再撤销例外。

设计依据是 [Evolving Memory Systems: An Eval-First Approach](https://linghao.io/posts/memory-systems-should-be-evolved)
提出的 replayable history、history-dependent checkpoints、addition/update/conflict/forgetting 压力；并吸收
[LongMemEval](https://arxiv.org/abs/2410.10813) 的 knowledge update / temporal reasoning / abstention 维度，以及
[MemConflict](https://arxiv.org/abs/2605.20926) 对“检索到旧事实但最终选择错误”的区分。这里不考复述事实，
所有 gate 都是不同的真实开发任务能否通过行为测试。

## 一道题究竟怎样测 memory

以第 01 → 02 题为最小例子：

1. 第 01 题明确告诉两组 Orion 的 P1/P2/P3 时限以及排序方式，并要求实现 deadline 函数。
2. 第 01 题结束后，sandbox 被销毁。Mempal 组会把这项产品决策写入持久 checkpoint；no-memory 组没有跨题状态。
3. 第 02 题只说“沿用之前约定的 Orion 响应规则和常规排序”，不再重复分钟数，并要求实现一个不同的 overdue 功能。
4. 隐藏测试传入覆盖 P1、P2、closed 和相同 deadline 的事件，只按第 01 题公开过的规则判断函数行为。

因此，第 02 题不是问“P2 是多少分钟”，而是要求 agent 用历史规则完成真实代码。no-memory 组没有足够信息，只能猜；
Mempal 组若正确保存并检索了历史，就能实现并通过测试。两组的通过率差异才是 memory 的效果。

后面的检查点逐渐变难：

- 第 05 题要采用 Orion 更新后的 customer P2=20，同时保留 internal P2=30，并排除 Vega P2=45 的干扰；
- 第 07 题要把默认规则与仍有效的 regulated P2=10 临时例外组合起来；
- 第 09 题要记住临时例外已经撤销，不能因为检索到旧记录就把 P2=10 复活。

## 时间线与预期记忆操作

稳定约定：只处理 open incident；时间输出为 UTC ISO；队列按 deadline、再按 id 排序。

| # | 事件 | Orion 当前真值 / 作用 | 主要归因 |
|---|---|---|---|
| 01 | 建立 | P1=5、P2=30、P3=240，内外相同 | addition |
| 02 | 自然 checkpoint | 用不重述数字的新功能复用规则 | retrieval |
| 03 | 干扰 | Vega 的 P1=10、P2=45、P3=360，明确不改变 Orion | interference resistance |
| 04 | 更新 | Orion 仅 customer P2 改为 20；internal P2 仍为 30 | update + scope |
| 05 | checkpoint | 在汇总功能中选最新 Orion 值并拒绝 Vega 污染 | temporal conflict |
| 06 | 例外 | Orion regulated customer P2 暂时改为 10 | scoped exception |
| 07 | checkpoint | 混合队列组合默认规则与局部覆盖 | composition |
| 08 | 撤销 | regulated 例外撤销；customer P2 回到 20 | forgetting |
| 09 | 最终 checkpoint | 导出中保留稳定规则、采用更新、抑制已撤销例外 | stale suppression |

01/03/04/06/08 是历史事件：本轮 prompt 会完整给出变更后的规则，因此即使没有 memory 也应能完成。
02/05/07/09 是记忆检查点：只引用“之前约定”“当前规则”“仍有效的例外”，不重复历史数值。另一客户 Vega
有自己的真实开发任务和测试，用于制造自然的语义干扰。隐藏测试只使用 starter README、本题 prompt，或链上前序
prompt 已公开的文件名、函数名、字段和规则。

理想结果不是“Mempal 9/9、baseline 0/9”。更有诊断价值的形状是：两组都通过完整给规则的历史事件，差异集中在
02/05/07/09；若 baseline 连 01/03/04 都失败，是普通编码能力问题；若 Mempal 只在 09 失败，则更像是能记住事实但
不能正确处理撤销和新旧冲突。

## 报告口径

- task success：9 道开发任务的 pass/fail。
- checkpoint survival：02 → 05 → 07 → 09 的有序二元轨迹，不用均值遮掉更新后的退化。
- attribution：按 metadata 分别看 retrieval、interference、update/scope、forgetting。
- efficiency：wall time、turns、token/cost、重复失败命令和 retry。

当前 Eval Group 只负责共享 Sandbox，不提供业务顺序；`maxConcurrency: 1` 也不能把文件名或数组位置升级成
正式顺序契约。因此显式 Eval 排序能力落地前，不得把这组结果解释成纵向 checkpoint survival。届时有记忆
条件仍须使用独立、干净的 cohort 从 01 完整重放，不能单跑某个 checkpoint 后把失败归因给记忆；正式比较
同时运行 baseline 与 Mempal，并比较同一检查点，而不是只看总平均分。自造题没有上游官方 patch，判据变更
仍需 RED、参考实现 GREEN、不同结构 ALT。
