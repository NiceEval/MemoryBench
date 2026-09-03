# Repository Guide

This repo is a benchmark suite for coding-agent memory conditions. The core rule is simple: evals should be real development tasks, and the primary pass/fail signal should be whether the task is completed.

总是使用中文回复与讨论

## 工作方式约定记在这里

**工作方式 / 流程偏好一律记录在本文件（AGENTS.md，CLAUDE.md 是它的符号链接），不散落在个人 memory。** 个人 memory 只放调试 know-how、项目状态、上游候选等（见下方「记录问题与 Know-How 的规范」）；「我该怎么协作」这类约定放这里，保证换 agent / 换会话都能读到。

### Git 工作流：直接在当前长期分支上开发

本仓库**直接在当前 checkout 的长期分支上提交**（本工作树当前是 `2-0`），不开临时 feature 分支、不走 PR review 流程。需要提交时直接 commit 到当前分支；push 仍只在用户明确要求时进行。

### 成本纪律：全量重跑必须用户批准

作废整批、全量重跑（比如换了镜像/环境后"为数据内部一致"重跑全部 attempt）**花的是真钱，必须先问用户**，不许 agent 自行决定。默认做法是 fix-forward：接受既有结果，环境修正后只补跑受影响的题（同一题补跑也以一次为限），在报告和数据说明里如实标注「混合环境批次」的 caveat。数据纯净性让位于成本；确需干净 cohort 的正式对比，把重跑成本报给用户由用户拍板（2026-08-04 用户明确要求）。

## 这个项目同时是 niceeval 的 dogfooding 场

本仓库的另一个目的是测试 niceeval 本身。niceeval 是 beta 软件，DX 可以随便改——反馈时可以打破一切惯性：不必顾虑向后兼容、已有用户习惯、行业惯例或「大家都这么设计」，从第一性原理出发想最理想的形态。API / CLI 直接 break 着改：不需要 v1 / v2 版本并存、不需要 deprecation 过渡期、不需要兼容层，旧形态直接删掉，一步到位改成理想形态。因此：

- **遇到 DX 不舒服、CLI 行为不理解、或感觉不是最佳实践的地方，先保留原始观察并判断 owner。** NiceEval 公开 Library / CLI / Report、随包文档、官方 Adapter 或官方仓库工具违反其承诺，且需要 NiceEval maintainer 处理时，才上报 NiceEval；本仓库自己的指南、评估用例、实验配置、脚本和 workaround 在本仓库修；第三方服务或依赖的问题交给对应上游。
- 「不舒服」包括但不限于：命令语义不直观、报错信息看不懂、需要手写 boilerplate、配置项互相打架、文档与实际行为不符、必须靠 workaround 才能跑通。
- NiceEval-owned 问题在绕过前先取得可复现证据和上游 owner；已经有 Issue owner 且继续工作不会掩盖证据时，可以 fix-forward。下游问题直接修正，不为它创建 NiceEval Issue。

## 每次工作结束后的 DX 反思

每次任务收尾时，回顾并明确回答两个问题：

1. 这次工作中哪些环节用起来不舒服、别扭、低效？
2. 其中哪些应该由 niceeval 官方提供（新 API、新 CLI 子命令、更好的默认值、更清晰的报错），而不是留在本仓库当 workaround？

把结论写在任务总结里。NiceEval-owned 产品问题的长期 owner 是公开脱敏的上游 Issue；MemoryBench-owned 问题由本仓库的代码、指南或文档承担 owner。只有调查后确认的根因、裁决和可复用 know-how 才进入 memory，不能用 memory 代替 Issue 跟进。

## NiceEval-owned 摩擦上报 GitHub Issues

从 NiceEval 公开入口或 NiceEval 自己维护、生成、随包分发的文档与工具观察到的可复现问题，只有在 NiceEval maintainer 仍负有后续动作时，才由 [NiceEval/NiceEval Issues](https://github.com/NiceEval/NiceEval/issues) 跟进，不在本仓库保留第二份 friction log。执行入口见 `.agents/skills/niceeval-issue/SKILL.md`。

- **遇到问题先保留原始 Observation**：记录实际看到的行为、复现、影响和必要证据；推测、根因候选与建议必须明确标成尚未证实。不得因为准备上报而弱化上文“停止工作并指出”的要求，也不得先用 workaround 掩盖问题。
- **先查 open + closed Issue**：在 `NiceEval/NiceEval` 同时搜索标题和正文；已有 owner 时交接现有 Issue URL，不重复创建。提交或对不确定结果重试前，还要按技能中的 machine marker 枚举核对。
- **先判 owner，再分类并脱敏**：本仓库自己的 `AGENTS.md`、README、评估用例、实验配置、脚本和 workaround 在本仓库修；第三方服务或依赖的问题交给其 canonical upstream。NiceEval 仍对公开行为负责、但外部依赖参与或阻塞时才使用 `area:dependency`，不能把它当通用转运标签。NiceEval Issue 的类型只选 `bug`、`enhancement`、`documentation` 之一；area 恰好选一个；新 Issue 加 `needs-triage`。删除 secrets、token、私有 endpoint、个人信息、绝对本机路径和不必要的私有运行数据，保留足以复现的公开 provenance。
- **安全问题不公开**：漏洞或可能泄露秘密的内容走 NiceEval 的 Private Vulnerability Reporting；不得先建公开 Issue、评论或用公开搜索泄露细节。
- **远端 mutation 每次单独授权**：agent 创建 Issue、评论、改 label 或提交 private report 前，都必须取得用户在当前任务中的明确授权；历史授权、仓库规则和本地草稿都不能代替。本轮未授权时只准备脱敏草稿并向用户请求授权。
- **Issue URL 是唯一跟进 owner**：成功后在交接中给出 URL；不要把正文、状态或链接再同步成本仓库日志。调查后形成的根因/裁决/know-how 仍按下方 memory 规范记录。
- **收尾必须对账**：DX 反思时检查本轮是否出现尚无 owner 的 NiceEval 问题；按上述流程查重，并在获得当次授权后提交，否则明确列出待授权草稿。未来不再使用 Frog。

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
- `niceeval.config.ts`: global attempt timeout and concurrency safety limits; agent, sandbox, judge and experiment-specific concurrency stay with the owning experiment or eval.
- Report publishing: `.niceeval/` 原样提交，是站点唯一数据源。`vercel.json` 的 buildCommand 指向 `scripts/vercel-build.sh`，**不是裸的 `niceeval view`**——脚本做三件不能省的事：① 跳过仓库 install（评测依赖很重且与报告无关），改在 `/tmp` 装 `niceeval@latest` + react 再把 node_modules 符号链接回仓库根，让站点始终跟随最新 niceeval 而非仓库锁定的版本；② `--experiment compare` 收窄出站范围，只有 compare 可比组进站点（2026-07-30 起所有实验都开在 `compare/` 下，这层收窄已不再挡任何东西——往 `compare/` 里放临时接线位，它会直接进站点）；③ `--report reports/memory.tsx` 指定报告定义（显式声明 `report` 概览页并组合官方 Attempt / Experiment 参数页，正文组件与详情页都跟随内建视图演进）。坑：Vercel 的 build cache 会把上次部署的 node_modules 恢复到仓库根，而 `ln -sfn` 对已存在的目录会把链接建进目录内部而不是替换它——脚本必须先 `rm -rf`，改这段时别把它删了。发布机制：`vercel.json` 已设 `git.deploymentEnabled: false`，平时 push 到长期分支不触发部署；**禁止本地 `vercel deploy` 当生产路径**。发布 = 打 `vX.Y.Z` tag 并 push tag，`.github/workflows/deploy-report.yml` 在 tag push 时用 Vercel CLI（`vercel pull` → `vercel deploy --prod --archive=tgz`）把**该 tag 的仓库内容**（含 `.niceeval/`）交给 Vercel 云端跑 `scripts/vercel-build.sh` 再挂生产域。不用 Actions 侧 `--prebuilt`（site/ 含 attempt+artifact 过大，上传易中断）。依赖仓库 secrets `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`。
- `.niceeval/record.sqlite` 使用 Git LFS 存储；tag 发布工作流必须以 `lfs: true` 检出，确保交给 Vercel 的归档包含真实数据库而不是 LFS pointer。

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

**三向验证靠判据 fingerprint 兜底：改完 fixtures 直接重跑，不需要 `--rerun all`。** 各题 `tests/`（以及题组 `_support/`）下的隐藏测试与判据脚本，在模块顶层用 `loadText()` / `loadJson()` / `loadYaml()` 读取，让内容进入该 eval 的 fingerprint；agent 最后一轮之后再用 `t.sandbox.writeText()` / `writeBytes()` 写进沙箱。改一个字节，引用它的那条 eval 自动作废、下次跑到它就重跑，其余 eval 照常携带。所以 RED / GREEN / ALT 三轮跑常规命令即可，看到的结论一定按当前判据得出。

**判据 loader 必须在模块顶层调用。** 运行期才读取会错过 fingerprint 规划；普通 `fs.readFile` 也不会登记依赖。动态 plan 等每次运行产生的内容不属于静态判据，继续在 `test(t)` 中用 `writeText` / `writeBytes`。

## 记录问题与 Know-How 的规范

调试基础设施问题（sandbox 报错、agent 安装失败、eval 超时等）时，先判断 owner。MemoryBench 自己的根因和修法写进最近的仓库文档、源码注释或本节索引；NiceEval-owned 问题先由公开 Issue 跟进，调查后形成的根因、裁决和可复用 know-how 才进入 NiceEval memory。个人目录里的 memory 不能作为仓库唯一事实源。

### 记什么

一条有效的 memory 条目包含三个部分：

1. **现象**：出现什么错误、在哪个 eval / sandbox / agent 上复现
2. **根因**：为什么会这样（代码假设、API 限制、路径 hardcode 等）
3. **修法与适用范围**：怎么改、以后遇到类似情况如何判断是否适用

### 记在哪里

- 工作方式和协作约定写本文件。
- 评估设计、实验约束和报告口径写进最近的 README / `docs/` 或拥有它的源码注释，并随 Git 提交。
- NiceEval 自身的根因、裁决和 know-how 由 NiceEval 仓库的 memory 维护；下游不直接改写上游 memory，也不用个人 `~/.claude` 目录替代仓库记录。

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

### 记忆条件的 Plugin 默认允许结果沿用

Eval Group 的物理复用本身不禁结果沿用；上游对 Group 与普通 Experiment 使用同一套 carry 门。记忆条件应把
lifecycle、Agent extension 与 Sandbox prepare 收进有版本 identity 的 Plugin。其它指纹输入相同时，终态结果
默认沿用，避免声明遗漏让昂贵评测永久重跑。

这不表示 Runner 能识别 callback 的语义变化。实现变化应改用 `defineSandboxCommand()` 并提高 `revision`；动态输入
进入 `inputs`。已经在旧 identity 下产生结果时，修正声明后对受影响选择执行 `--rerun all`。

中断后的“全量重跑”也不等于状态自动干净。mempal checkpoint 与 Nowledge 远端库可能已经收到中断 Attempt 的
半次写入；正式对比应改用新的 `MEMPAL_COHORT` / `NOWLEDGE_COHORT`。当前 Eval Group 尚无业务顺序 API，
不得把数组位置解释成完整记忆轨迹；需要前缀顺序的实验等显式排序契约落地后再正式采集。沿用旧 cohort 继续跑只用于
调试，不与完整批次混作同一比较样本。真正无法固定的 Provider 环境身份仍会以 `carry-disabled` 阻断沿用。

### Active compare 的 Sandbox 只引用 NiceEval 官方 Agent 镜像

`experiments/compare/` 当前五条实验统一从 NiceEval 导出的 Bub/Codex 官方镜像常量起步；仓库不再
要求操作者预构建 `memorybench-*` 镜像。权限修正、公共系统工具、Mempal/Obelisk/Remem 安装、
预热和探针必须用带稳定 `id`、输入内容、配方 revision/fingerprint 与 `changeFrequency` 的
`SandboxAction` 声明，让 Docker SetupPrefix cache 自动构建、发现、管理和复用最长匹配前缀。
只有 checkpoint 恢复/回存、队列 drain 等依赖运行期状态的步骤才保留 callback；callback 应排在
所有稳定工具层之后，避免过早形成 cache barrier。跨 Attempt 的记忆生命周期仍由 Eval Group
物理复用及各条件自己的 checkpoint/hook 契约负责，不能把 setup cache 当成记忆状态持久层。

## Reporting

When summarizing results, report both:

- task success: pass/fail, pass rate, failed tests, build status
- efficiency: wall time, turns, token/cost budget, repeated failed commands, retries

The benchmark claim is comparative: same task, same model, different memory condition.

### 看结果、查问题只许走 CLI：`pnpm --silent exec niceeval show`

**禁止直接读 `.niceeval/` 下的任何文件**（`result.json` / `run.json` / `sources/*.json` 一律不许 cat、grep、Read、写脚本解析）。要看跑得怎么样，只能用 `pnpm --silent exec niceeval show` 的公开切片。

两个理由：① 直接读文件会绕过 CLI，于是 CLI 呈现不了的东西永远暴露不出来，而暴露它正是本仓库 dogfooding 的价值；② raw Record 是私有结构，照着它写的分析脚本会跟随 schema 变化失效。

**同一条规则覆盖 debug，不只覆盖「看结果」。** 诊断历史运行时不得读 `node_modules/niceeval/{src,dist}/**`，也不得拿当前 eval / experiment 源码反推历史执行。先问「CLI 的哪个切片应该告诉我这件事」；缺少必要证据就是 NiceEval 呈现缺口，不靠实现或私有落盘绕过。

读 API、CLI 或排查手册时先读 `node_modules/niceeval/INDEX.md`，再进入它指向的随包文档；这是查当前安装版本的公开契约。需要结构化数据时用 `--json`，并通过 `pnpm --silent exec niceeval` 调用，保持 stdout 只有 NiceEval 的机器输出。

常用切片：

| 想知道 | 命令 |
| --- | --- |
| 某实验整体通过率 / 成本 / 当前 Record 中匹配的 attempt locator | `pnpm --silent exec niceeval show --experiment <experimentId>` |
| 审计一个已知的完整历史 run | `pnpm --silent exec niceeval show --run <runId>`（可重复传入 `--run`） |
| 单条 attempt 的概览与诊断 | `pnpm --silent exec niceeval show @<locator>` |
| 单条 attempt 的阶段耗时树 | `pnpm --silent exec niceeval show @<locator> --timing` |
| agent 到底干了什么 | `pnpm --silent exec niceeval show @<locator> --execution`（需要时配 `--grep`） |
| agent 改了哪些文件 | `pnpm --silent exec niceeval show @<locator> --diff` |
| 该 attempt 固定的 source snapshot | `pnpm --silent exec niceeval show @<locator> --source` |

参数以当前安装包的 `niceeval show --help` 和 `node_modules/niceeval/INDEX.md` 为准，不在本文件维护按日期冻结的 CLI changelog。`show` 暴露不了完成当前归因所需的证据时，先确认公开切片确实缺失，再按 owner 规则提交 NiceEval 呈现缺口；不得读取 `.niceeval/` 私有文件绕过。

<!-- BEGIN:niceeval-agent-rules -->
# niceeval is NOT in your training data

Its APIs and conventions may differ from anything you have seen. Start with
`node_modules/niceeval/INDEX.md`, then read the task-specific bundled guides it points
to before writing any eval, experiment, adapter, or niceeval config. That index and
the bundled Chinese docs are the authoritative version matching this installation.
After a run, use this repository's package-manager invocation of `niceeval show` for
diagnosis (`pnpm --silent exec niceeval show` in a pnpm project). Pick an `@<locator>`
from the compact index, then show that locator for an overview, or add
`--source` / `--execution` / `--timing` / `--diff` / `--json` for evidence.
When diagnosing an existing run, do not inspect raw `.niceeval` files or treat the current
`evals/` or `agents/` source as evidence of what happened in that run. If `niceeval show`
cannot expose the evidence you need, report that product gap. Reading source remains
appropriate when the task is to author or modify that source.
<!-- END:niceeval-agent-rules -->
