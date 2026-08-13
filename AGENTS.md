# Repository Guide

This repo is a benchmark suite for coding-agent memory conditions. The core rule is simple: evals should be real development tasks, and the primary pass/fail signal should be whether the task is completed.

总是使用中文回复与讨论

## 工作方式约定记在这里

**工作方式 / 流程偏好一律记录在本文件（AGENTS.md，CLAUDE.md 是它的符号链接），不散落在个人 memory。** 个人 memory 只放调试 know-how、项目状态、上游候选等（见下方「记录问题与 Know-How 的规范」）；「我该怎么协作」这类约定放这里，保证换 agent / 换会话都能读到。

### Git 工作流：直接在 main 上开发

本仓库**直接在 `main` 分支上提交**，不开 feature 分支、不走 PR review 流程。需要提交时直接 commit 到 `main`（这覆盖「在默认分支上先建分支」的通用默认行为）。push 仍只在用户明确要求时进行。

### 成本纪律：全量重跑必须用户批准

作废整批、全量重跑（比如换了镜像/环境后"为数据内部一致"重跑全部 attempt）**花的是真钱，必须先问用户**，不许 agent 自行决定。默认做法是 fix-forward：接受既有结果，环境修正后只补跑受影响的题（同一题补跑也以一次为限），在报告和数据说明里如实标注「混合环境批次」的 caveat。数据纯净性让位于成本；确需干净 cohort 的正式对比，把重跑成本报给用户由用户拍板（2026-08-04 用户明确要求）。

## 这个项目同时是 niceeval 的 dogfooding 场

本仓库的另一个目的是测试 niceeval 本身。niceeval 是 beta 软件，DX 可以随便改——反馈时可以打破一切惯性：不必顾虑向后兼容、已有用户习惯、行业惯例或「大家都这么设计」，从第一性原理出发想最理想的形态。API / CLI 直接 break 着改：不需要 v1 / v2 版本并存、不需要 deprecation 过渡期、不需要兼容层，旧形态直接删掉，一步到位改成理想形态。因此：

- **遇到 DX 不舒服、CLI 行为不理解、或感觉不是最佳实践的地方，直接停止工作并指出来**，不要尝试自己解决或绕过。绕过会掩盖 niceeval 应该修的问题。
- 「不舒服」包括但不限于：命令语义不直观、报错信息看不懂、需要手写 boilerplate、配置项互相打架、文档与实际行为不符、必须靠 workaround 才能跑通。
- 停下来指出的价值高于把当前任务硬推完成——上游修一次，所有下游受益（参见 memory 中 niceeval/fastevals 的上下游关系）。

## 每次工作结束后的 DX 反思

每次任务收尾时，回顾并明确回答两个问题：

1. 这次工作中哪些环节用起来不舒服、别扭、低效？
2. 其中哪些应该由 niceeval 官方提供（新 API、新 CLI 子命令、更好的默认值、更清晰的报错），而不是留在本仓库当 workaround？

把结论写在任务总结里；值得跟进的记入 memory，并标注「候选上游 feature request」。

## What To Optimize For

- Prefer existing benchmark verifiers: unit tests, integration tests, build checks, Docker harnesses, or upstream scoring scripts.
- Do not add separate "memory recall" gates unless the product task itself requires that behavior.
- Treat memory as an experimental condition. Its value should show up in elapsed time, tokens, cost, fewer failed commands, fewer repeated attempts, and better pass^k.
- Keep eval tasks agent-neutral. The same eval should run across Codex, Claude Code, bub/Tape, and no-memory baselines.

## Repo Layout

- `evals/`: niceeval task definitions, 每个上游仓库一个目录（`downshift/`、`react-datepicker/`、`react-hook-form/`、`react-tooltip/`、`yet-another-react-lightbox/`），外加自造的链式题 `toggl-cli/` 与冒烟题 `dogfood/`。有私有素材的题使用文件夹入口 `evals/<family>/<id>/eval.ts`，隐藏测试与跑测脚本共址在该题的 `tests/`；题组共享素材放没有 `eval.ts` 的 `_support/`。隐藏判据**一律在 agent 最后一轮之后才写进沙箱**，agent 全程看不到也改不了判据。
  中央 fixtures 目录（`evals/fixtures/`）已于 2026-08-01 删除，隐藏素材一律与题共址，不要再造中央目录。
- `workspaces/`: 拷进沙箱的起始仓库。目前只有 `dogfood/` 还在用；PR 题改成 clone 真实上游仓库并 reset 到 base commit，所以这里多数目录是没接线的历史遗留。
- `experiments/`: comparable run matrices for agents and models.
- `experiments/shared/`: 记忆条件的跨实验封装（`mempal.ts`、`nowledge.ts`）；agent adapters come from `niceeval/adapter`, not this repo.
- `docs/benchmarks.md`: benchmark survey and candidate task notes.
- `niceeval.config.ts`: global judge and timeout defaults (agent/sandbox/concurrency are per-experiment).
- Report publishing: `.niceeval/` 原样提交，是站点唯一数据源。`vercel.json` 的 buildCommand 指向 `scripts/vercel-build.sh`，**不是裸的 `niceeval view`**——脚本做三件不能省的事：① 跳过仓库 install（评测依赖很重且与报告无关），改在 `/tmp` 装 `niceeval@latest` + react 再把 node_modules 符号链接回仓库根，让站点始终跟随最新 niceeval 而非仓库锁定的版本；② `--exp compare` 收窄出站范围，只有 compare 可比组进站点（2026-07-30 起所有实验都开在 `compare/` 下，这层收窄已不再挡任何东西——往 `compare/` 里放临时接线位，它会直接进站点）；③ `--report reports/memory.tsx` 指定报告定义（只声明一个 `report` 页，正文全部用内建组件拼，跟随内建视图演进；它没有 attempt 页，见上文「看结果只许走 CLI」的呈现缺口）。坑：Vercel 的 build cache 会把上次部署的 node_modules 恢复到仓库根，而 `ln -sfn` 对已存在的目录会把链接建进目录内部而不是替换它——脚本必须先 `rm -rf`，改这段时别把它删了。发布机制：`vercel.json` 已设 `git.deploymentEnabled: false`，平时 push 到 `main` 不触发部署；**禁止本地 `vercel deploy` 当生产路径**。发布 = 打 `vX.Y.Z` tag 并 push tag，`.github/workflows/deploy-report.yml` 在 tag push 时用 Vercel CLI（`vercel pull` → `vercel deploy --prod --archive=tgz`）把**该 tag 的仓库内容**（含 `.niceeval/`）交给 Vercel 云端跑 `scripts/vercel-build.sh` 再挂生产域。不用 Actions 侧 `--prebuilt`（site/ 含 attempt+artifact 过大，上传易中断）。依赖仓库 secrets `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`。
- `scripts/hooks/pre-commit`: 体积闸。niceeval 原样落盘工具输出，agent 一句 `grep -R` 扫进 node_modules 就能让单个 trace.json 破 100MB，撞死 GitHub 单文件硬上限。hook 会把 >50MB 的文件自动移出本次提交（不拦 commit，文件留在磁盘上）。**新 clone 后需手动启用一次**：`git config core.hooksPath scripts/hooks`。

## Adding Evals

Use the original benchmark's pass condition wherever possible:

- SWE-bench style tasks should pass `FAIL_TO_PASS` and avoid `PASS_TO_PASS` regressions.
- Terminal-Bench tasks should pass the task's existing `run-tests.sh` / pytest verifier.
- RepoMod-Bench tasks should build and pass the hidden pytest suite for `/workspace/dst`.
- Local Next.js fixtures should pass the focused source assertions plus `build`.

Additional source assertions are fine when they are part of the task's functional requirement. Avoid assertions whose only purpose is proving that an agent remembered a fact.

### 隐藏测试不许断言 prompt 没给过的标识符

直接把上游 PR 的测试搬来当隐藏测试是**默认错误做法**——上游测试是贴着上游实现写的，会连带把私有命名搬进判据。规则：

> **隐藏测试里出现的每一个标识符（CSS 类名、DOM 结构、函数返回的键名、组件 state 字段、新增的 callback prop），要么在 prompt 里写清楚是公开契约，要么就不许出现在断言里。**

**链式题（`evals/toggl-cli/` 那种跨 eval 引用约定的题）把「prompt」放宽为「本 eval 或链上任一前序 eval 的 prompt」**——
那正是被测能力：约定在第 1 题说过，第 3 题只含糊提一句"照老规矩"，agent 得靠记忆补上。放宽的只有「在哪说过」，
没放宽「说没说过」：链上从没出现过的标识符，照样不许进断言。写链式题时在 eval 文件头把「本题建立了哪几条约定 /
本题复用哪几条、来自哪一题」列成表，否则过几周没人能判断某条断言是否合法。

区分标准是「库的使用者需不需要知道它」：
- **是公开契约** → 写进 prompt，理直气壮地断言。例：`react-tooltip__place-<placement>` 类名，consumer 要写 CSS 就必须知道；不写死这个名字功能本身就没意义。
- **不是** → 改成行为断言。例：内部函数多返回一个键、组件 state 叫什么、新造的 wrapper 节点叫什么。

行为断言的常用替代手法（都在本仓库有现成例子）：
- 读无障碍标签而不是内部 state：`.react-datepicker__month` 的 `aria-label="Month June, 2024"` 能直接判断哪个面板显示哪个月（pr-6058）
- 用文档顺序而不是新类名：`compareDocumentPosition` 比较 `__current-month` / `__day-names` / `__month` 的先后，可完整表达 top/middle/bottom（pr-6092）
- 用公开 prop 驱动内部状态：react-tooltip 的 `middlewares` 是公开 prop，用一个强制 placement 的 floating-ui middleware 就能造出「实际 placement ≠ 请求的 place」，无需 mock 内部模块（pr-970）
- 给异步实现留出 flush：断言前 `await act(async () => {})`，让 observer / microtask 类实现也能算对，而不是只认同步写法（lightbox commit-5578052）

### 新增或改动隐藏测试后必须做三向验证

只验 RED→GREEN 会漏掉「测试锁死了上游实现」这一类问题——这正是 2026-07-23 那次四道题 100% 失败的成因。三向缺一不可：

1. **RED**：base commit 原样跑隐藏测试 → 必须挂，且**挂的原因要正确**（是功能缺失，不是编译错、找不到文件之类）
2. **GREEN**：打上游官方修复 → 必须全过
3. **ALT**：自己写一个**合理但与上游不同**的实现 → 也必须全过

第 3 步是硬性要求。ALT 不用写得漂亮，够用就行：换个类名、换个内部字段名、把上游的新 callback prop 换成组件本地 state。只要 ALT 挂了，就是测试在考实现而不是考功能，回去改测试。

顺带一提，跑 GREEN 时如果上游官方修复自己都过不了某条断言（lightbox 那道就是：官方 fix 解决不了「祖先 dir 属性被改」的场景），说明 prompt 描述的症状和测试考的场景根本不是同一件事，要改的是 prompt。

**三向验证靠 transfer manifest 兜底：改完 fixtures 直接重跑，不需要 `--rerun all`。** 各题 `tests/`（以及题组 `_support/`）下的隐藏测试与判据脚本，在 agent 最后一轮之后用 `t.sandbox.uploadFile(new URL(...), target)` / `uploadDirectory(...)` 直接上传。Runner 在真实读取 source 时记录内容摘要：改一个字节，引用它的那条 eval 自动作废、下次跑到它就重跑，其余 eval 照常携带。所以 RED / GREEN / ALT 三轮跑常规命令即可，看到的结论一定按当前判据得出。

**不要在模块顶层登记 loader，也不要先读成字符串再走 `writeFiles`。** 每条 Eval 在需要判据的位置直接传本地 `URL`；共享 harness 也直接上传自己的 `_support/` URL。这样同一 helper 被多条 Eval 调用时，每次真实传输都归当前 Attempt，既不依赖模块求值顺序，也没有第二套 fixture 声明面。动态 plan 这类内存内容用 `writeText` / `writeBytes`。

## 记录问题与 Know-How 的规范

调试基础设施问题（sandbox 报错、agent 安装失败、eval 超时等）时，发现的具体问题和修法**记入 memory**，不写进本文件。

### 记什么

一条有效的 memory 条目包含三个部分：

1. **现象**：出现什么错误、在哪个 eval / sandbox / agent 上复现
2. **根因**：为什么会这样（代码假设、API 限制、路径 hardcode 等）
3. **修法与适用范围**：怎么改、以后遇到类似情况如何判断是否适用

### 记在哪里

- `~/.claude/projects/.../memory/` 目录下，每个问题一个 `.md` 文件
- 类型用 `feedback`（行为规范）或 `project`（具体项目状态）
- 更新 `MEMORY.md` 索引，保证下次对话能被加载

### 什么时候记

- 踩坑并修复之后立刻记，趁上下文还在
- 发现某个假设在换了 sandbox backend / model / 实验配置后不成立时
- 修法有反直觉之处（比如"调大 timeout 反而让 session 更短"）时

### judge 配置写在 eval 上,不写全局 config

`judge` 既能写在 `niceeval.config.ts`(全局)也能写在 `defineEval({ judge })`(单题),**本仓库一律写单题**。
理由是指纹作用域:judge 配置进指纹,写全局就是全仓库共用一个,换一次评审模型把**所有** eval 的沿用结果
一起作废,包括根本不碰 judge 的那些。2026-07-30 实测:全局 judge 从 `gpt-5.6` 换到 `gpt-5.6-sol` 之后
`exp compare/codex toggl-cli/ --dry` 只剩 1/18 可沿用。加新的 judge 题就在那条 eval 里写自己的 judge 块。

配套两件事:① 评审模型不要和被测 agent 同一个(自评);② 代理的可用模型清单是会变的运行时事实,
`judge precheck failed` 先分清 404(模型下架 → 一条 curl 探活换名字)和 timed out(代理并发占满),
两者报错都指向 baseUrl,极易误诊。见 memory: x1api-gpt-5.4-mini-unavailable、proxy-account-concurrency-cap。

### 记忆条件的 callback 默认允许结果沿用

`sandboxReuse: true` 本身不禁结果沿用；上游对复用与普通 Experiment 使用同一套 carry 门。mempal / nowledge
使用的直接 lifecycle / prepare callback 不提供额外 identity，但不再阻断跨 Run carry。其它指纹输入相同时，终态结果
默认沿用，避免声明遗漏让昂贵评测永久重跑。

这不表示 Runner 能识别 callback 的语义变化。实现变化应改用 `defineSandboxCommand()` 并提高 `revision`；动态输入
进入 `inputs`。已经在旧 identity 下产生结果时，修正声明后对受影响选择执行 `--rerun all`。

中断后的“全量重跑”也不等于状态自动干净。mempal checkpoint 与 Nowledge 远端库可能已经收到中断 Attempt 的
半次写入；正式对比应改用新的 `MEMPAL_COHORT` / `NOWLEDGE_COHORT`，从头重建该条件的顺序轨迹。沿用旧 cohort
继续跑只用于调试，不与完整批次混作同一比较样本。直接 callback 不再是 carry blocker；真正无法固定的 Provider
环境身份仍会以 `carry-disabled` 阻断沿用。

## Reporting

When summarizing results, report both:

- task success: pass/fail, pass rate, failed tests, build status
- efficiency: wall time, turns, token/cost budget, repeated failed commands, retries

The benchmark claim is comparative: same task, same model, different memory condition.

### 看结果、查问题只许走 CLI：`pnpm niceeval show`

**禁止直接读 `.niceeval/` 下的任何文件**（`result.json` / `run.json` / `sources/*.json` 一律不许 cat、grep、Read、写脚本解析）。
要看跑得怎么样，只能用 `pnpm niceeval show` 的各个切片。这条覆盖下面自动生成块里「per-attempt `result.json`
是 structured source of truth」的说法——那句话对 niceeval 的普通用户成立，对本仓库不成立。

两个理由：① 直接读文件会绕过 CLI，于是 CLI 呈现不了的东西永远暴露不出来，而暴露它正是本仓库 dogfooding 的价值；
② `result.json` 是内部结构、跟着 `schemaVersion` 变，照着它写的分析脚本下次升级就烂掉。

**同一条规则覆盖 debug，不只覆盖「看结果」。** 诊断一次运行为什么失败时，同样**禁止去读 niceeval 的实现**
（`node_modules/niceeval/{src,dist}/**` 一律不许 grep / Read 来找答案，例：「哪来的 600s 超时」不许靠翻
sandbox 源码解决）。判定顺序固定：先问「CLI 的哪个切片应该告诉我这件事」，问不出来就是**呈现缺口**——
把它记进下面的清单并直接对用户说「CLI 看不到」，不要靠读实现绕过去。绕过去一次，这个缺口就永远不会被上游修。

唯一允许读 niceeval 仓库内容的场景是**写**东西之前读文档（`node_modules/niceeval/docs-site/zh/**`，见下方自动生成块），
那是查 API 契约；debug 期读 `src/` / `dist/` 是查实现，两者不要混为一谈。

需要结构化数据时用 `--json`，**但要走 `pnpm --silent`**：`pnpm niceeval` 会先往 stdout 打两行
`Already up to date` / `Done in …`，JSON 解析必挂。

常用切片：

| 想知道 | 命令 |
| --- | --- |
| 某实验整体通过率 / 成本 / 每题耗时 | `pnpm niceeval show --exp <experimentId>` |
| 每题的历次执行、错误摘要、attempt locator | `pnpm niceeval show --exp <id> --history` |
| 单条 attempt 的阶段耗时树（clone / install / agent 各花多久） | `pnpm niceeval show @<locator> --timing` |
| agent 到底干了什么 | `pnpm niceeval show @<locator> --execution`（配 `--grep` / `--expand`） |
| agent 改了哪些文件 | `pnpm niceeval show @<locator> --diff` |
| token / 成本明细 | `pnpm niceeval show --exp <id> --usage` |
| 跨历史执行的稳定性矩阵 | `pnpm niceeval show --exp <id> --stats` |

已知呈现缺口（**候选上游 feature request**，遇到时直接说「CLI 看不到」，不要退回去读文件）：

- **快照组合丢沿用结果：`show`/`view` 的默认概览既不含 carried、accept 也救不回来**（2026-08-04 实测，
  已到不读源码的排查边界，按 bug 上报）：run 计划明确打印 `36 of 36 carried in from cache`，跑完后
  `show --exp` 的快照却只有 1 条；把 36 条历史终态逐一 `niceeval accept`（全部成功、发新 locator）后
  快照也只组进 6 条；accept 后再跑一次全沿用 run，新快照又缩回 1 条。`--history --json` 能证明沿用
  attempt 确实进了 run 记录（runStartedAt 是新 run、locator 指向历史），是「组快照」这层把它们丢了。
  **可靠视图只有两个：`show --exp <id> --history`（单实验全史）与 `show --stats`（36 题 × 全实验矩阵）**；
  报告站点读快照,在上游修复前站点显示的就是残缺切片,不是数据丢了。期望：快照按「每题最新终态」组合,
  或至少把 carried/accepted 与 fresh 一视同仁。
- **sandboxReuse 的复用身份看不到**：`sandboxId` / 第几条 lane / lane 内第几条 attempt 只落在 `result.json`，
  `show` 的任何切片（含 `--timing --json`）都不含这些字段。做 sandboxReuse 提速测量时只能靠 `--timing` 里
  install 耗时的阶梯反推是不是同一条 lane，很别扭。
- ~~裸 `show @<locator>` 在本仓库根本用不了~~ **已修复，且它是排查 errored 的首选切片**（2026-08-04 复测）：
  此前报 "the built-in report has no attempt-input page"，现在直接给出**阶段名 + 完整错误正文**
  （例：`! agent.ensure` / `! unexpected-error: Cannot verify Sandbox platform … fetch failed`），
  `ctx.facts()` 与 `ctx.diagnostic` 也只在这个概览里可读。
  **排查 errored 一定先用它**：`--timing` 只在失败命令后打个 ✗ 不给正文，`--execution` 在 agent 起来之前就挂掉的
  attempt 上只会说 "no events recorded"，概览行里的错误又被截断成 `unexpected-error:…`——
  2026-08-04 就是照着这条过时记录先试了 `--timing`/`--execution`，绕了一圈才拿到错误正文。
- **`--history` 印出来的 locator 有一部分打不开**：`show --exp <id> --history` 会把历史 run 里的 attempt
  一并列出（快照头部写着 "composed from N runs"），但拿它印的 locator 去 `show @<locator> --timing` 会被拒：
  `Locator @xxx is outside the selected record scope.`——同一条命令刚把这个 locator 当作「打开它的方式」印给你，
  下一条命令又说它不在 scope 里。报错也不说怎么扩大 scope（`--record` 是钉记录根，不是选 run；`--run` 只有 `view` 有）。
  后果：只有最近一次 run 的 attempt 能下钻，历史 attempt 的失败原因查不了（2026-07-30 撞到：nowledge 组
  01/02 的首次 attempt 全部无法打开）。
- **attempt 被超时杀掉时，看不出是哪一层的 timeoutMs 生效**：`--timing` 只在被杀的那条命令后面打一个 ✗，
  不显示这条命令拿到的 deadline 是多少、来自哪一层（flag / experiment / eval / config / provider SDK 默认）。
  2026-07-30 靠它暴露出一个**真 bug**（已修，见 memory: agent-command-killed-at-600s）：`sandboxReuse` 的建实例
  路径从不把 attempt deadline 递给沙箱，于是复用泳道上每条命令都吃 e2b SDK 默认的 60 秒，实验声明的
  `timeoutMs: 1200000` 形同虚设。**当时能确诊全靠人肉发现「✗ 的命令停在整 1m 0s」这个整数关口**——
  CLI 一个字都没提这条线是谁给的。呈现缺口本身仍在：期望 `--timing` 每条命令标出 `deadline=…(来源层)`，
  超时错误里写明是沙箱 per-command 超时。教训：看到 `deadline_exceeded` 先看被 ✗ 的命令时长**是不是卡在
  60s / 600s 这种整数关口**，是就去查 deadline 传导，不要因为「重跑能过」就判成 flaky
  （60s 只砍超过 60s 的命令，轻量题碰不到，所以它天生长得像偶发）。
- ~~`--dry` 的 plan 不说明每条为什么要重跑~~ **已具备**（2026-07-30 实测）：逐条标 `carried` / `locked` /
  `stale: config:agentInstall.revision` / `new`，原因是给全的。注意 `stale: config:agentInstall.revision`
  这一档很容易撞上——agent 的安装版本一变，此前跑的结果全作废。
- ~~`niceeval exp` 的多余位置参数被静默当 eval 前缀吞掉~~ **已修**（2026-08-04 实测）：位置参数匹配不到任何
  eval 现在会报错退出，并提示怎么跑另一个实验——`No eval matched prefix: <x> in experiments selected by <exp>.` +
  `Positional args after the first select eval id prefixes. To run another experiment, run it as its own command.`
  反向的危险仍在：多写的参数若恰好是个**有效** eval 前缀（手滑写 `toggl-cli` 而非 `toggl-cli/04`），plan 会悄悄
  膨胀成 6 题且不报错，这一半只能靠人肉核对 `--dry`。
  **实验的选择本身够用**：实验 id 支持前缀匹配，`exp compare/codex` 正好命中三个 codex 实验（3 configs）
  且排除 claude/bub —— 不要因为 `exp` 不支持可重复的 `--exp` 就退回「一个实验开一个进程」，那会丢掉 niceeval 的
  全局并发闸（`maxConcurrency` 是进程内的，3 个进程各开 4 路 = 12 路，直接撞爆代理约 5 路的账号级上限）。

<!-- BEGIN:niceeval-agent-rules -->
# niceeval is NOT in your training data

Its APIs and conventions may differ from anything you have seen. Start with
`node_modules/niceeval/INDEX.md`, then read the task-specific bundled guides it points
to before writing any eval, experiment, adapter, or niceeval config. That index and
the bundled Chinese docs are the authoritative version matching this installation.
After a run, drill into failures with `niceeval show` — pick an `@<locator>` from the
compact index it prints, then `niceeval show @<locator>` for a compact overview, or add
`--source` / `--execution` / `--diff` for evidence; the run directories the CLI prints
are the structured source of truth: `run.json` holds the run's metadata and each
`<evalId>/a<attempt>/result.json` holds that attempt's verdict and assertions, next to
its artifact files (`events.json` / `trace.json` / `diff.json`).
<!-- END:niceeval-agent-rules -->
