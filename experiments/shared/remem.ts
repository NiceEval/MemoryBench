import { setTimeout as delay } from "node:timers/promises";
import type { CodexConfig } from "niceeval/adapter";
import { command, NICEEVAL_CODEX_DOCKER_IMAGE, shell } from "niceeval/sandbox";
import type {
  SandboxCommand,
  SandboxCommandTarget,
} from "niceeval/sandbox";

/**
 * remem 记忆条件:https://github.com/majiayu000/remem —— 单二进制、本地 SQLite、
 * Codex 官方集成用 SessionStart(读)/ Stop(写)hook + MCP server(`remem mcp`)。
 *
 * ## 拓扑与记忆态语义
 *
 * remem 状态是纯本地文件(`$HOME/.remem/`),没有跨 run checkpoint。一次 run 内，
 * 每个 Eval Group 独占一个可复用 Docker Sandbox：Group 内串行并在 `$HOME`
 * 中积累记忆，Group 之间可并行；Attempt 间只 reset workdir，不清 `$HOME`、
 * `/tmp`、全局安装或背景进程。这与 nowledge(远程中心化共享)和 mempal
 * (host checkpoint 显式跨 run 回存)都不同。
 *
 * 2026-08-09 全量重跑时，Docker events 只有 6 个容器，正好对应 6 个
 * Eval Group；`maxConcurrency=4` 时最多 4 条 Attempt 同时执行，各 lane 的
 * 后续 Attempt 没有新建容器。toggl-cli 链上 `captured_events`
 * 5→7→8→10→12 也证明 `$HOME/.remem` 的原始捕获确实跨题存活。
 *
 * 但同一批次里 `memories=0`、`latest_session_memory_spend.ai_calls=0`，且
 * extraction 有终止失败。remem 0.6.47 的内部 memory AI 会再启动一个
 * Codex CLI，并固定传 `--ignore-user-config`；所以它不读 NiceEval Adapter 写进
 * `~/.codex/config.toml` 的自定义 provider/base URL，`remem model use auto` 也不能
 * 继承实验模型。现在 postSetup 用专用 wrapper 把 `openai_base_url` 以
 * CLI override 传进去，并显式钉住 memory model；preTeardown 在 25s 收尾预算内
 * 尽力排空 extraction，下一条 postSetup 会在 Agent 启动前继续收敛未完 retry。
 * 丢失、终止失败、超时或零 memory-AI call 都会明确报错。
 *
 * 修复后单独重跑 toggl-cli 六段链为 5/6：03、04 从此前持续失败转为首次通过，06
 * 仍因把“每条不足 30 分钟按 30 分钟”误用成“每月最低 3 小时”而失败。六题的
 * extraction queue 都在 teardown 归零且没有失败，最终累计 12 个 captured events、
 * 85 条 raw messages。这说明 Docker 复用、凭据路由与提炼生命周期已经恢复；剩余
 * 失败属于记忆语义精度，不再是 sandbox 或后台 worker 故障。
 *
 * 随后的两路全量重跑暴露了另一条独立边界：60 分钟 Docker TTL 在后段不足以再覆盖
 * 30 分钟 Attempt + cleanup，provider 按契约在 05→06 间换容器；facts 从
 * raw_messages=63/captured=9 回到 14/2。实验因此把本地状态型 Remem/Obelisk 的 TTL
 * 提到 5 小时，覆盖最大 8-member Group 的整条 lane。Mempal 有 host checkpoint，
 * Nowledge 是远端状态，不需要用超长 TTL 阻止正常轮换。
 *
 * **历史（2026-08-04）：以下是旧派生镜像为 root 时的第一层故障，已由
 * 非 root 镜像修复；2026-08-09 的容器事件已证明当前复用成立。**
 * niceeval 文档写"题间 reset 不是整台 Sandbox 归零……`$HOME` 等 workdir 外状态会保留",实测
 * 在由 Eval Group 复用的 `dockerSandbox` 中,codexAgent 的
 * postSetup/preTeardown(Agent 级 Hook,每条 Attempt 一次)对 `$HOME` 的写入确实**不会
 * 存活到下一条 Attempt**——但**根因已定案:本仓库这份派生镜像当时没有声明 `USER`,
 * `docker run` 默认以 root 执行,而 niceeval Docker Sandbox 的文档化契约是「非 root 是
 * 预制环境自己的义务,不是 runner 的强加」(niceeval docs「Docker：从官方基线继续构建」)——
 * Docker provider 的复用安全检查在检测到 root 身份时拒绝复用,静默把物理沙箱退休、给下一条
 * Attempt 新建一个全新容器**。每条 Attempt 压根没有分到同一个物理容器,`$HOME` 自然每次
 * 都是空的——不是"Agent 级钩子的文件系统写入不共享"这个更深的机制问题(先前版本的这段注释
 * 与并行的 obelisk 记忆条件的排查结论互相印证过这个更悲观的猜测,现已被推翻:两个记忆条件
 * 撞的是同一个更浅、也更好修的原因)。已用同一派生镜像做过反事实验证:补上 `USER node`
 * 后,以 uid 1000 身份跑,Docker 复用安全检查通过,`$HOME` 标记文件确实跨题间 reset
 * 存活。修法见 `codex-remem.Dockerfile` r3(末尾 `USER node`,安装步骤仍在此之前以 root
 * 完成)。基底其后已升级到 `niceeval/codex:0.144.1-r4`(NiceEval commit cbac5659,派生
 * Dockerfile 同步到 r4):r4 把「收尾声明 `USER node`」收进了基底本身,派生层不用再自己
 * 发明非 root,但删 Yarn、装 python3、COPY 二进制这些安装步骤都要求 root,派生层因此改为
 * 显式 `USER root` 做完安装再显式 `USER node` 收尾——这一行现在的语义是恢复基底身份,
 * 不是发明非 root。
 *
 * 证据来自 `compare/codex-gpt-5.6-luna--remem` 全量结果里的 toggl-cli 链式题,这批题
 * 专门设计成"后面几题的正确答案只能从前面几题建立的约定里回忆,当题不重新说明"
 * (这批实测记录本身仍然准确,只是下面的因果解释已按上一段更正):
 *
 * | eval | 是否需要回忆前题约定 | 结果 |
 * |---|---|---|
 * | 01-entry-stats | 否(建立约定,不需要回忆) | 通过 |
 * | 02-entry-bill | 否(建立"15 分钟向上取整"约定) | 通过 |
 * | 03-entry-bill-weekly | **是**(只能从第 2 题回忆取整规则) | **失败**——取值是未取整的原始值(1800/1860,应为 2700/2700) |
 * | 04-billing-doc | **是**(`/home/sandbox/workspace` 故意留空,纯靠记忆回答) | **失败**——agent 原话"没有实现或文档可参考,无法验证规则" |
 * | 05-entry-invoice | 否(建立"最低计费额"约定) | 通过 |
 * | 06-entry-invoice-monthly | **是**(同时回忆第 2、5 题两条规则) | **失败**——同样是未取整的原始值 |
 *
 * 模式非常干净:**不需要回忆的题全过,需要回忆的题全部以"就像完全没有记忆"的方式失败**——
 * 不是部分退化,是彻底没有前题信息。postSetup 的三件自查(hooks.json 双 hook、
 * mcp_servers.remem)每条 Attempt 都验证通过,`remem doctor`/`remem status` 结构性检查
 * 也从没报过错,说明**接线本身没问题**,问题出在 `$HOME/.remem/remem.db` 这份状态没能
 * 跨 Attempt 存活——每条 Attempt 拿到的都是一个全新、空的 `$HOME`(全新容器,不是同一容器
 * 被清空),`remem install` 每次都在从零建库,只是碰巧建库耗时和"检测到已存在"耗时差不多
 * (实测都在 900ms 上下),光看 postSetup 的执行时长完全看不出区别,这也是这个问题直到跑
 * 链式题才暴露的原因。
 *
 * 这批旧结果因此只能当 no-memory baseline 参考。Dockerfile r3 补了
 * `USER node`；后续官方基底也把非 root 身份收进契约，当前派生层在安装后
 * 显式恢复 `USER node`。2026-08-09 的新批次已将物理复用与提炼接线分开验收。
 *
 * ## 为什么要派生 Docker 镜像(而不是直接在官方 niceeval/codex 镜像上跑)
 *
 * 完整背景见 experiments/shared/docker/codex-remem.Dockerfile 文件头,这里摘要:
 *
 * 1. remem 官方发布的所有 Linux 预编译二进制都要求 glibc >= 2.39(实测跨版本一致,
 *    不是钉错版本);niceeval/codex:0.144.1-r3 是 Debian bookworm,glibc 2.36,直接跑
 *    会 `GLIBC_2.39' not found`。
 * 2. 从源码 `cargo install remem-ai --no-default-features`(见下)能绕开,但每条物理
 *    Sandbox 装一遍 Rust 工具链 + 编译要 5-6 分钟；烘进派生镜像后这笔成本只在构建镜像时
 *    付一次,sandbox `.prepare()` 退化成 mempalPrepare 同款的薄探测(`command -v remem`)。
 * 3. 派生时顺手删掉基础镜像预装的 Yarn(2026-08-04 由并行的 obelisk 记忆条件冒烟测出:
 *    本仓库这批 eval 的安装步骤假设环境没有 Yarn,预装 Yarn 会导致 `npm error EEXIST`),
 *    并补上基础镜像缺的 `python3`(2026-08-04 全量跑本实验时撞出:toggl-cli/ 6 条里 5 条
 *    死于 Rust 工具链装完后紧跟的 `python3: command not found`)。这两处都与记忆条件无关,
 *    是 Docker 基底与本仓库 fixture 工具链的差异，已统一上报上游；Obelisk 自己建了不含
 *    remem 的等价镜像（只处理 Yarn 那一处），两边派生互不依赖。
 *
 * `--no-default-features` 关掉的是 remem 默认开启的 `local-onnx` embedding 后端——它依赖
 * 一份预编译 onnxruntime 静态库(`ort-sys`),那份产物同样要求 glibc >= 2.38,即使自己编译
 * remem 本体也会在链接期报 `undefined symbol: __isoc23_strtoll` 一类 C23 stdlib 符号缺失。
 * 关掉后 embedding provider 退化到 `feature-hash`(确定性非语义 fallback)——这不是本仓库
 * 独有的降级,remem 官方文档把它列为 darwin-x64(缺 onnxruntime 预编译)时的同一条已文档化
 * 路径。FTS5 BM25 + entity index 检索通道不受影响。
 *
 * 真正的记忆捕获/蒸馏路径(Stop hook -> background worker -> codex-cli)不受上面
 * embedding 降级影响。它复用 Adapter 提供的 `CODEX_API_KEY`，但 remem 强隔离的
 * Codex 子进程不读用户 config；因此本文件的 wrapper 另外传入 `openai_base_url`，
 * profile 也显式使用实验模型，而不是 `auto`。
 *
 * ## 上游任一问题修复后如何回退
 *
 * - remem 发布 glibc 2.36 兼容的二进制(或本仓库升级到 glibc >= 2.39 的官方镜像)后,
 *   Dockerfile 的 builder stage 和 `--no-default-features` 都可以去掉,`local-onnx` 也能开。
 * - niceeval/codex 官方镜像发布不预装 Yarn 的新 revision 后,删 Yarn 那一层可以整段删除。
 * - 两件事都修好后,派生镜像可以整体退休,直接引用 NiceEval 导出的 Codex Docker 镜像常量,
 *   `rememPrepare` 从"探测预装二进制"改回"运行时装"(参照本文件改造前的 nowledge 思路)。
 *
 * 重建镜像:`bash scripts/build-codex-remem-docker-image.sh`。
 */

/** NiceEval 公开、版本钉死的当前 Codex Docker 基底；构建脚本与此常量同步读取。 */
const CODEX_REMEM_BASE_IMAGE = NICEEVAL_CODEX_DOCKER_IMAGE;
const CODEX_REMEM_BASE_TAG = CODEX_REMEM_BASE_IMAGE.slice(CODEX_REMEM_BASE_IMAGE.lastIndexOf(":") + 1);

/**
 * remem crates.io 版本,构建镜像与结果 flags 共用这一处。2026-08-04 GitHub Releases 最新版。
 * 每次升级同时改三处并保持一致(镜像 tag 不是从这个常量自动计算的哈希,是手动同步,
 * 与 scripts/build-obelisk-docker-image.sh 对自己版本常量的做法一致):
 * 这个常量、scripts/build-codex-remem-docker-image.sh 里的 REMEM_VERSION、
 * experiments/shared/docker/codex-remem.Dockerfile 的 REMEM_VERSION 默认值。
 */
export const REMEM_VERSION = "0.6.47";

/**
 * Dockerfile 本身的配方版本(与 remem 版本、base 镜像版本正交):派生镜像里"多做了什么"
 * 变了就加一档,不动 REMEM_VERSION。r1 = 只删 Yarn + 装 remem;r2 = 再补上 python3
 * (2026-08-04,见上面文件头注释第 3 点);r3 = 末尾声明 `USER node`(2026-08-04,见下面
 * 「拓扑与记忆态语义」一节根因修正);r4 = 基底从 `niceeval/codex:0.144.1-r3` 升级到
 * `0.144.1-r4`(NiceEval commit cbac5659,r4 把 `USER node` 收进了基底本身),派生层不再
 * 自己发明非 root,改为显式 `USER root` 做完安装步骤再显式 `USER node` 恢复基底身份
 * (2026-08-04)。tag 里带上它,避免同名 tag 悄悄指向不同内容——与
 * scripts/build-codex-remem-docker-image.sh、Dockerfile 头部注释手动保持同步。
 * r7 = 基底改为从 NiceEval 公开 Codex Docker 镜像常量读取，当前解析为 r5，避免本仓库手写
 * 过时的 Agent 基底 tag。
 */
const CODEX_REMEM_DOCKERFILE_REVISION = "r7";

/** 派生镜像 tag——base 镜像版本、remem 版本、Dockerfile 配方版本都编进去,任一个变了 tag 自然不同。 */
export const REMEM_DOCKER_IMAGE = `memorybench-codex-remem:${CODEX_REMEM_BASE_TAG}-${REMEM_VERSION}-${CODEX_REMEM_DOCKERFILE_REVISION}`;

const REMEM_TEARDOWN_DRAIN_TIMEOUT_MS = 25_000;
const REMEM_SETUP_RECOVERY_TIMEOUT_MS = 5 * 60_000;
const REMEM_DRAIN_POLL_MS = 1_000;
const REMEM_CODEX_WRAPPER = "$HOME/.local/bin/remem-codex";

/** 报告分组与 provenance 共用的实验事实。 */
export function rememFlags(memoryModel: string): Record<string, string> {
  return {
    memory: "remem",
    rememVersion: REMEM_VERSION,
    rememMemoryModel: memoryModel,
  };
}

function commandFailure(label: string, result: { exitCode: number; stdout: string; stderr: string }): Error {
  const tail = (result.stderr || result.stdout).trim().slice(-500) || "no output";
  return new Error(`[remem] ${label} failed (exit ${result.exitCode}): ${tail}`);
}

function requiredCodexBaseUrl(): string {
  const value = process.env.CODEX_BASE_URL?.trim();
  if (!value || !/^https?:\/\/[^\s"]+$/.test(value)) {
    throw new Error("CODEX_BASE_URL must be a non-empty HTTP(S) URL without whitespace or quotes.");
  }
  return value;
}

function requiredCodexApiKey(): string {
  const value = process.env.CODEX_API_KEY?.trim();
  if (!value) throw new Error("CODEX_API_KEY is required for Remem memory extraction.");
  return value;
}

function assertMemoryModel(memoryModel: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(memoryModel)) {
    throw new Error(`Invalid Remem memory model name: ${JSON.stringify(memoryModel)}`);
  }
}

/**
 * Sandbox `.prepare()`:每条 Attempt 重放的薄探测,只验证派生镜像里已经烘好的 remem 二进制
 * 版本对不对——与 mempalPrepare 同一个思路：二者都验证预制 Docker 镜像里的二进制。
 * 不在这里装任何东西：装的活全在构建镜像阶段做完。
 */
export function rememPrepare(): SandboxCommand {
  const missing =
    `[remem] image does not contain remem ${REMEM_VERSION}. Build ${REMEM_DOCKER_IMAGE} with ` +
    "`bash scripts/build-codex-remem-docker-image.sh`, then use that image.";
  return shell(
    [
      "set -eu",
      `command -v remem >/dev/null 2>&1 || { printf '%s\\n' ${JSON.stringify(missing)} >&2; exit 1; }`,
      `remem --version | grep -F -- ${JSON.stringify(REMEM_VERSION)} >/dev/null || { printf '%s\\n' ${JSON.stringify(missing)} >&2; exit 1; }`,
    ].join("\n"),
  );
}

const INSTALL_REMEM_CODEX_WRAPPER = [
  "set -eu",
  'test -n "${CODEX_BASE_URL:-}" || { printf \'%s\\n\' \'[remem] CODEX_BASE_URL is required\' >&2; exit 1; }',
  'test -x /usr/local/bin/codex || { printf \'%s\\n\' \'[remem] /usr/local/bin/codex is missing\' >&2; exit 1; }',
  'install -d -m 0755 "$HOME/.local/bin"',
  `cat >"${REMEM_CODEX_WRAPPER}" <<'EOF'`,
  "#!/bin/sh",
  ': "${CODEX_BASE_URL:?CODEX_BASE_URL is required for Remem memory extraction}"',
  'exec /usr/local/bin/codex -c "openai_base_url=\\"${CODEX_BASE_URL}\\"" "$@"',
  "EOF",
  `chmod 0755 "${REMEM_CODEX_WRAPPER}"`,
].join("\n");

/**
 * postSetup 的静态命令都用 `shell()` / `command()` 声明，因此
 * `niceeval exp ... --dry --commands` 能按生命周期顺序展示它们。这些步骤每条
 * Attempt 幂等收敛：重写同一 wrapper、重放 remem install、重申明 profile。
 */
export function rememPostSetup(
  memoryModel: string,
  codexBaseUrl: string,
  codexApiKey: string,
): SandboxCommand[] {
  assertMemoryModel(memoryModel);
  const wrapperPath = REMEM_CODEX_WRAPPER.replace("$HOME", "${HOME}");
  return [
    shell(INSTALL_REMEM_CODEX_WRAPPER, { env: { CODEX_BASE_URL: codexBaseUrl } }),
    command("remem", ["install", "--target", "codex"]),
    shell(`remem config set memory_ai.profiles.codex.path "${wrapperPath}"`),
    command("remem", ["model", "use", memoryModel, "--profile", "codex"]),
    shell(
      [
        "set -eu",
        'grep -q \'"SessionStart"\' "${CODEX_HOME:-$HOME/.codex}/hooks.json"',
        'grep -q \'"Stop"\' "${CODEX_HOME:-$HOME/.codex}/hooks.json"',
        'grep -q "mcp_servers.remem" "${CODEX_HOME:-$HOME/.codex}/config.toml"',
        `remem config show | grep -Fq -- "${wrapperPath}"`,
        `remem model current --profile codex | grep -Fq -- ${JSON.stringify(memoryModel)}`,
        `"${REMEM_CODEX_WRAPPER}" --help >/dev/null`,
      ].join("\n"),
      { env: { CODEX_BASE_URL: codexBaseUrl } },
    ),
    // 上一条 Attempt 如果在 30s teardown 预算内未完成 retry，必须在本条 Agent
    // 启动前收敛，否则 SessionStart 会在旧记忆未就绪时读库。首题空队列立即返回。
    rememDrainExtraction({ baseUrl: codexBaseUrl, apiKey: codexApiKey }, {
      timeoutMs: REMEM_SETUP_RECOVERY_TIMEOUT_MS,
      requireCapturedWork: false,
    }),
  ];
}

interface RememStatus {
  totals?: {
    memories?: number;
    raw_messages?: number;
  };
  raw_archive?: {
    ingest_failures?: number;
  };
  capture_pipeline?: {
    captured?: number;
    dropped?: number;
    unrecovered_spills?: number;
    extract_todo?: number;
    extract_running?: number;
    extract_failed?: number;
  };
  latest_session_memory_spend?: {
    ai_calls?: number;
    ai_total_tokens?: number;
  } | null;
}

function statusCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`[remem] status field ${label} is not a non-negative integer.`);
  }
  return value as number;
}

async function readRememStatus(sb: SandboxCommandTarget, signal: AbortSignal): Promise<RememStatus> {
  const result = await sb.runCommand("remem", ["status", "--json"], { signal });
  if (result.exitCode !== 0) throw commandFailure("remem status --json", result);
  try {
    return JSON.parse(result.stdout) as RememStatus;
  } catch (error) {
    throw new Error(
      `[remem] remem status --json returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Stop hook 会后台启动 `remem worker --once`，所以只看一次 status 会把「已捕获、
 * 尚未提炼」误当成健康。这里等整个本地 extraction queue 排空；如果背景
 * worker 已经退出而队列还有 todo，同步补跑一次 worker，让 Remem 自己的 retry
 * 契约有机会收敛。这是数据依赖的运行时分支，在 `--dry --commands` 中保持 opaque；
 * 其余静态 shell 都是可展示的声明式命令。
 */
function rememDrainExtraction(
  credentials: { baseUrl: string; apiKey: string },
  options: { timeoutMs: number; requireCapturedWork: boolean },
): SandboxCommand {
  return async (sb, ctx) => {
    const deadline = Date.now() + options.timeoutMs;
    let lastQueue = "";

    while (true) {
      const status = await readRememStatus(sb, ctx.signal);
      const memories = statusCount(status.totals?.memories, "totals.memories");
      const rawMessages = statusCount(status.totals?.raw_messages, "totals.raw_messages");
      const captured = statusCount(status.capture_pipeline?.captured, "capture_pipeline.captured");
      const dropped = statusCount(status.capture_pipeline?.dropped, "capture_pipeline.dropped");
      const spills = statusCount(
        status.capture_pipeline?.unrecovered_spills,
        "capture_pipeline.unrecovered_spills",
      );
      const todo = statusCount(status.capture_pipeline?.extract_todo, "capture_pipeline.extract_todo");
      const running = statusCount(
        status.capture_pipeline?.extract_running,
        "capture_pipeline.extract_running",
      );
      const failed = statusCount(
        status.capture_pipeline?.extract_failed,
        "capture_pipeline.extract_failed",
      );
      const ingestFailures = statusCount(status.raw_archive?.ingest_failures, "raw_archive.ingest_failures");
      const aiCalls = statusCount(
        status.latest_session_memory_spend?.ai_calls ?? 0,
        "latest_session_memory_spend.ai_calls",
      );
      const aiTokens = statusCount(
        status.latest_session_memory_spend?.ai_total_tokens ?? 0,
        "latest_session_memory_spend.ai_total_tokens",
      );

      ctx.facts("remem.memories", memories);
      ctx.facts("remem.raw_messages", rawMessages);
      ctx.facts("remem.captured_events", captured);
      ctx.facts("remem.extract_todo", todo);
      ctx.facts("remem.extract_running", running);
      ctx.facts("remem.extract_failed", failed);
      ctx.facts("remem.memory_ai_calls", aiCalls);
      ctx.facts("remem.memory_ai_tokens", aiTokens);

      if (dropped > 0 || spills > 0 || failed > 0 || ingestFailures > 0) {
        throw new Error(
          `[remem] capture/extraction is unhealthy: dropped=${dropped}, spills=${spills}, ` +
            `failed=${failed}, ingest_failures=${ingestFailures}.`,
        );
      }

      if (todo === 0 && running === 0) {
        if (options.requireCapturedWork && (captured === 0 || rawMessages === 0 || aiCalls === 0)) {
          throw new Error(
            `[remem] extraction drained without usable memory-AI work: captured=${captured}, ` +
              `raw_messages=${rawMessages}, ai_calls=${aiCalls}.`,
          );
        }
        ctx.progress({
          message: `[remem] extraction drained: captured=${captured}, memories=${memories}, ai_calls=${aiCalls}`,
        });
        return;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `[remem] extraction did not drain within ${options.timeoutMs}ms: todo=${todo}, running=${running}.`,
        );
      }

      const queue = `todo=${todo}, running=${running}`;
      if (queue !== lastQueue) {
        ctx.progress({ message: `[remem] waiting for extraction: ${queue}` });
        lastQueue = queue;
      }

      if (running === 0) {
        const worker = await sb.runCommand("remem", ["worker", "--once"], {
          env: {
            CODEX_API_KEY: credentials.apiKey,
            CODEX_BASE_URL: credentials.baseUrl,
          },
          sensitiveValues: [credentials.apiKey, credentials.baseUrl],
          signal: ctx.signal,
          timeoutMs: Math.max(1, deadline - Date.now()),
        });
        if (worker.exitCode !== 0) throw commandFailure("remem worker --once", worker);
      }
      await delay(REMEM_DRAIN_POLL_MS, undefined, { signal: ctx.signal });
    }
  };
}

export function rememPreTeardown(credentials: { baseUrl: string; apiKey: string }): SandboxCommand {
  return rememDrainExtraction(credentials, {
    timeoutMs: REMEM_TEARDOWN_DRAIN_TIMEOUT_MS,
    requireCapturedWork: true,
  });
}

/** Codex 主进程和 Remem Stop-hook worker 共用同一份实验凭据/代理路由。 */
export function rememCodexConfig(
  memoryModel: string,
): Pick<CodexConfig, "configFile" | "env" | "postSetup" | "preTeardown"> {
  assertMemoryModel(memoryModel);
  const codexBaseUrl = requiredCodexBaseUrl();
  const codexApiKey = requiredCodexApiKey();
  const credentials = { baseUrl: codexBaseUrl, apiKey: codexApiKey };
  return {
    // remem 需要 [features] hooks = true 才能让 SessionStart/Stop 生效;mcp_servers 是
    // Adapter 保留键,不写在这里——remem install 会在 postSetup 里自己往 config.toml 追加
    // [mcp_servers.remem],发生在 Adapter 自己的 setup(含保留键校验)完成之后,不冲突。
    configFile: "configs/codex/remem.toml",
    // apiKey 仍由 Codex Adapter 的专用通道注入；这里只增加 lifecycle worker
    // 必须继承的 base URL。NiceEval 对 env 值统一脱敏，dry plan 只显示 key。
    env: { CODEX_BASE_URL: codexBaseUrl },
    postSetup: rememPostSetup(memoryModel, codexBaseUrl, codexApiKey),
    preTeardown: [
      rememPreTeardown(credentials),
      shell(
        [
          "set -eu",
          'test -s "$HOME/.remem/remem.db"',
          'grep -q \'"Stop"\' "${CODEX_HOME:-$HOME/.codex}/hooks.json"',
        ].join("\n"),
      ),
    ],
  };
}
