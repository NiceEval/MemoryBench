# Mempal 记忆条件

## 当前设计

Mempal 条件由四部分组成：

1. 两个 Agent 专属、版本化的 Docker 镜像：分别从 NiceEval 导出的公开、版本钉死 Claude Code / Codex 镜像继续构建，预置 mempal 二进制与约 507 MB embedding cache。
2. agent 行为提示：Claude Code / Codex 共用仓库的 `mempal-memory` Skill；Claude Code 另通过 adapter 的 `settingsFile` 安装 Stop hook。
3. Sandbox 生命周期：`prepare` 只探测二进制和模型 cache；每个 Eval Group 的 Docker Sandbox 在 `setup` 恢复 checkpoint、在 `teardown` 回存 checkpoint。
4. 显式 cohort：`MEMPAL_COHORT` 同时进入实验 flags 和 checkpoint 路径，避免不同研究批次混读状态。

稳定、体积大且每次相同的依赖都只在 Docker build 时付一次成本。运行期不编译 Rust、不下载 embedding 模型，也不把重依赖藏进不透明的 setup；它只处理随实验与 Group 变化的状态和 fail-fast 验证。

## 构建镜像

```bash
pnpm docker:mempal claude
pnpm docker:mempal codex
```

构建脚本从 `niceeval/sandbox` 的 `NICEEVAL_CLAUDE_CODE_DOCKER_IMAGE` 或 `NICEEVAL_CODEX_DOCKER_IMAGE` 常量读取基底，而非在本仓库复制 tag。每个产物 tag 都包含：

- 基底镜像完整引用的短 hash；
- `MEMPAL_VERSION`；
- `MEMPAL_DOCKERFILE_REVISION`。

所以任一输入变化都会得到新 tag，不会把内容不同的镜像静默覆盖到旧实验身份上。构建脚本会拉取基底、构建镜像，并实际验证默认 `node` 身份、Agent CLI、mempal CLI 与 HuggingFace cache。它只构建本机 Docker image，不发布 registry 资源。

`experiments/shared/docker/mempal.Dockerfile` 在构建期完成两项工作：

- 用 `cargo install mempal --version <pin> --locked` 从 crates.io 编译 CLI；builder stage 不进入最终镜像。
- 以运行身份执行一次 `mempal init → ingest → search`，让 mempal 从 HuggingFace 官方源下载 `model2vec` cache，并在构建时确认 cache 真正落盘。

warmup 的数据库随后删除，因此每条 Attempt 仍从它自己的恢复 checkpoint 或空库开始。镜像只留下不可变工具与模型 cache。

## 生命周期、复用与并发

Eval Group 拥有物理 Sandbox 的复用边界；Mempal Experiment 不声明第二层复用开关。每个 Group 的真实 Attempt 串行使用自己的 Docker Sandbox，不同 Group 则继续由 Experiment 的 `maxConcurrency` 并行调度。普通 compare 条件保留四条 Docker lane；Signalbox 保持单 Group、`maxConcurrency: 1`，但当前 Group 不提供业务顺序契约，因此还不能把它解释成正式纵向轨迹。

```text
NiceEval Docker Agent 基底
  → Mempal 派生镜像（CLI + embedding cache）
  → 每个 Eval Group 创建一台物理 Docker Sandbox
      → sandbox.setup：恢复 cohort / experiment / Group 对应 checkpoint，或初始化空库
      → 每条真实 Attempt 的 sandbox.prepare：二进制与 cache 薄探测
      → agent.setup：安装 mempal-memory Skill；Claude 同时安装 Stop hook
      → agent run
  → Group 的物理 Sandbox 退休时 sandbox.teardown
      → 打包状态、原子回存、写 provenance metadata
```

`lifetimeMs` 是每台可复用 Docker Sandbox 的显式寿命预算，必须足以容纳单条长 Attempt；它不是云端账号配额，也不改变 Experiment 的并发语义。Docker 运行身份固定为非 root `node`，以满足可复用容器的安全前提。

完整的 init → ingest → search 只在镜像构建期做一次。Attempt 不重复做业务无关的向量化工作。恢复/回存复用 NiceEval checkpoint 原语；teardown 回存是 best-effort，失败会通过 diagnostic 留在结果中，但不能反改已经完成的任务 verdict。

## 状态身份与可回顾性

状态路径：

```text
.cache/mempal/state/<MEMPAL_COHORT>/<experimentId>/<evalGroupId>.tgz
.cache/mempal/state/<MEMPAL_COHORT>/<experimentId>/<evalGroupId>.tgz.meta.json
```

`MEMPAL_COHORT` 省略时为 `local`。它必须是单个、最长 64 字符的路径安全名称，只能包含字母、数字、点、下划线和连字符，不能使用 `.` / `..` 或路径分隔符。正式比较必须显式指定新的 cohort，并在报告中记录它：

```bash
MEMPAL_COHORT=2026-08-clean-a pnpm --silent exec niceeval exp compare --dry
```

metadata 记录 `experimentId`、`evalGroupId`、cohort、mempal 版本、字节数、SHA-256 和保存时间。checkpoint 与 metadata 都先写同目录临时文件再原子替换；digest 可以帮助发现进程在两次替换之间被强杀造成的不一致。

不要把同一道固定答案题跨 run 反复喂给同一 cohort。Skill 和 Stop hook 都明确禁止存储 proposal 编号、hidden-test 猜测、任务最终答案或原始 transcript；更严格的研究设计应使用 train/apply 配对任务，或为每轮评测创建新 cohort。

## 结果有效性

一批可用于比较的 Mempal 结果至少要同时满足：

- 对应 Docker 镜像的 prepare 探针通过；
- trace 中能看到与任务相关的 `mempal search` / `mempal ingest` 行为；
- checkpoint metadata 可定位，并且 cohort 起点明确；
- 任务没有从同 cohort 的同题答案获益。

任务通过率仍是主要指标；memory 的价值看耗时、token、成本、重复失败命令和 pass rate，不增加只为了证明“记住了”的额外 gate。
