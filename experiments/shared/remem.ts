import type { CodexConfig } from "niceeval/adapter";
import type {
  SandboxCommand,
  SandboxCommandContext,
  SandboxCommandTarget,
} from "niceeval/sandbox";

/**
 * remem 记忆条件:https://github.com/majiayu000/remem —— 单二进制、本地 SQLite、
 * Codex 官方集成用 SessionStart(读)/ Stop(写)hook + MCP server(`remem mcp`)。
 *
 * ## 拓扑与记忆态语义
 *
 * remem 状态是纯本地文件(`$HOME/.remem/`),没有外部服务、没有跨 run 的 checkpoint 回存。
 * **设计意图**是只在一次 run 的物理沙箱 `$HOME` 内积累(`maxConcurrency: 1` 保证同一物理
 * Sandbox 上的 Attempt 严格串行),按串行顺序持续写入、被后续题读到——这与 nowledge(中心化
 * 远程服务器,跨 run/跨实验天然共享)和 mempal(host 侧 tgz checkpoint,显式跨 run 回存)
 * 都不同,本应是三种记忆条件里状态生命周期最短的一种。
 *
 * **2026-08-04 实测推翻了这个设计意图的前半句,但根因不是 niceeval 违反自己的文档承诺。**
 * niceeval 文档写"题间 reset 不是整台 Sandbox 归零……`$HOME` 等 workdir 外状态会保留",实测
 * 在 `dockerImageSandbox` + `sandboxReuse: true` 这个组合下,codexAgent 的
 * postSetup/preTeardown(Agent 级 Hook,每条 Attempt 一次)对 `$HOME` 的写入确实**不会
 * 存活到下一条 Attempt**——但**根因已定案:本仓库这份派生镜像当时没有声明 `USER`,
 * `docker run` 默认以 root 执行,而 niceeval Docker Sandbox 的文档化契约是「非 root 是
 * 预制环境自己的义务,不是 runner 的强加」(niceeval docs「Docker：从官方基线继续构建」)——
 * sandboxReuse 的复用安全检查在检测到 root 身份时拒绝复用,静默把物理沙箱退休、给下一条
 * Attempt 新建一个全新容器**。每条 Attempt 压根没有分到同一个物理容器,`$HOME` 自然每次
 * 都是空的——不是"Agent 级钩子的文件系统写入不共享"这个更深的机制问题(先前版本的这段注释
 * 与并行的 obelisk 记忆条件的排查结论互相印证过这个更悲观的猜测,现已被推翻:两个记忆条件
 * 撞的是同一个更浅、也更好修的原因)。已用同一派生镜像做过反事实验证:补上 `USER node`
 * 后,以 uid 1000 身份跑,sandboxReuse 的复用检查通过,`$HOME` 标记文件确实跨题间 reset
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
 * **因此这批 `compare/codex-gpt-5.6-luna--remem` 结果不能读成"remem 记忆条件的真实效果"**,
 * 只能读成"remem 装对了、hook/MCP 真实生效,但当时派生镜像没声明非 root 身份,导致
 * sandboxReuse 从未真正复用过物理容器,退化成了事实上的 no-memory baseline"。总通过率
 * (32/36)与一个不带记忆的 codex baseline 应该非常接近,唯一的系统性差异就在 toggl-cli 这
 * 三道强制回忆题上。这不是 niceeval 的 bug,是本仓库派生镜像未遵守文档化的执行身份契约——
 * 现已在 Dockerfile r3 修复(基底其后于 2026-08-04 升级到 `niceeval/codex:0.144.1-r4`,
 * `USER node` 已收进基底本身,派生 Dockerfile 同步到 r4);用干净 cohort 重新采集有效批次
 * 需要用户批准全量重跑成本(2026-08-04 协调决策,见 AGENTS.md「成本纪律」)。
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
 *    是 Docker 镜像与 NiceEval 官方 E2B 模板的工具链基线差异,已统一上报上游;obelisk 自己
 *    建了不含 remem 的等价镜像(只处理 Yarn 那一处),两边派生互不依赖。
 *
 * `--no-default-features` 关掉的是 remem 默认开启的 `local-onnx` embedding 后端——它依赖
 * 一份预编译 onnxruntime 静态库(`ort-sys`),那份产物同样要求 glibc >= 2.38,即使自己编译
 * remem 本体也会在链接期报 `undefined symbol: __isoc23_strtoll` 一类 C23 stdlib 符号缺失。
 * 关掉后 embedding provider 退化到 `feature-hash`(确定性非语义 fallback)——这不是本仓库
 * 独有的降级,remem 官方文档把它列为 darwin-x64(缺 onnxruntime 预编译)时的同一条已文档化
 * 路径。FTS5 BM25 + entity index 检索通道不受影响。
 *
 * 真正的记忆捕获/蒸馏路径(Stop hook -> `remem summarize --host codex-cli`)用的是
 * `executor = "codex-cli"`:remem 自己再拉起 codex CLI 做总结,复用 codexAgent 已经配好的
 * `CODEX_API_KEY` / `CODEX_BASE_URL`,不需要另外的 LLM API key,也不受上面的 embedding
 * 降级影响。默认 profile 把 model 硬编码成 `gpt-5.2`(代理没有这个模型名);postSetup 里
 * 用 `remem model use auto` 改成让 remem 内部的 codex-cli 调用不传 `--model`、直接沿用
 * `~/.codex/config.toml` 里 Adapter 已经写好的实验模型——不猜一个代理专属预设名。
 *
 * ## 上游任一问题修复后如何回退
 *
 * - remem 发布 glibc 2.36 兼容的二进制(或本仓库升级到 glibc >= 2.39 的官方镜像)后,
 *   Dockerfile 的 builder stage 和 `--no-default-features` 都可以去掉,`local-onnx` 也能开。
 * - niceeval/codex 官方镜像发布不预装 Yarn 的新 revision 后,删 Yarn 那一层可以整段删除。
 * - 两件事都修好后,派生镜像可以整体退休,直接引用 `niceeval/codex:...` 官方镜像字面量,
 *   `rememPrepare` 从"探测预装二进制"改回"运行时装"(参照本文件改造前的 nowledge 思路)。
 *
 * 重建镜像:`bash scripts/build-codex-remem-docker-image.sh`。
 */

const CODEX_REMEM_BASE_IMAGE = "niceeval/codex:0.144.1-r4";

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
 */
const CODEX_REMEM_DOCKERFILE_REVISION = "r5";

/** 派生镜像 tag——base 镜像版本、remem 版本、Dockerfile 配方版本都编进去,任一个变了 tag 自然不同。 */
export const REMEM_DOCKER_IMAGE = `memorybench-codex-remem:${CODEX_REMEM_BASE_IMAGE.split(":")[1]}-${REMEM_VERSION}-${CODEX_REMEM_DOCKERFILE_REVISION}`;

/** 报告分组与 provenance 共用的实验事实。 */
export function rememFlags(): Record<string, string> {
  return {
    memory: "remem",
    rememVersion: REMEM_VERSION,
  };
}

function commandFailure(label: string, result: { exitCode: number; stdout: string; stderr: string }): Error {
  const tail = (result.stderr || result.stdout).trim().slice(-500) || "no output";
  return new Error(`[remem] ${label} failed (exit ${result.exitCode}): ${tail}`);
}

async function requireCommand(sb: SandboxCommandTarget, label: string, script: string): Promise<void> {
  const result = await sb.runShell(script);
  if (result.exitCode !== 0) throw commandFailure(label, result);
}

function commandLog(ctx: SandboxCommandContext, message: string): void {
  ctx.progress({ message });
}

/**
 * Sandbox `.prepare()`:每条 Attempt 重放的薄探测,只验证派生镜像里已经烘好的 remem 二进制
 * 版本对不对——与 mempalPrepare 同一个思路(mempal 验证 e2b 模板里的二进制,这里验证
 * Docker 镜像里的二进制)。不在这里装任何东西:装的活全在构建镜像阶段做完。
 */
export function rememPrepare(): SandboxCommand {
  return async (sb, ctx) => {
    const probe = await sb.runShell("command -v remem");
    if (probe.exitCode !== 0) {
      throw new Error(
        `[remem] image does not contain remem. Build ${REMEM_DOCKER_IMAGE} with ` +
          "`bash scripts/build-codex-remem-docker-image.sh`, then use that image.",
      );
    }
    const version = await sb.runShell("remem --version");
    const versionText = version.stdout.trim();
    if (!versionText.includes(REMEM_VERSION)) {
      throw new Error(
        `[remem] image binary reports ${JSON.stringify(versionText)}, expected version ${REMEM_VERSION}. ` +
          `Rebuild ${REMEM_DOCKER_IMAGE} with \`bash scripts/build-codex-remem-docker-image.sh\`.`,
      );
    }
    ctx.facts("remem.binary_version", versionText);
    commandLog(ctx, `[remem] image probe passed: ${versionText}`);
  };
}

/**
 * codexAgent postSetup:每条 Attempt 都在(可能残留的)`$HOME` 上重放 `remem install --target codex`。
 * 实测(2026-08-04,手工在 niceeval/codex:0.144.1-r3 派生容器里跑两遍):第二遍 key/db 显示
 * "existing" 而非 "created",`[mcp_servers.remem]` 不重复写,是声明式收敛、不是"探测到就跳过"
 * 的反例写法,满足复用 Sandbox 对 postSetup 幂等性的硬要求。
 *
 * `remem model use auto` 同样验证过幂等(重跑第二遍直接显示当前值、不报错)——把 remem 内部
 * 用来做 Stop-hook 总结的 codex-cli 调用从硬编码的 `gpt-5.2`(代理没有这个模型)改成不传
 * `--model`,沿用 `~/.codex/config.toml` 里 Adapter 已经为本实验写好的模型。
 *
 * 自查三件套:hooks.json 里 SessionStart + Stop 都注册了、config.toml 里挂了
 * `[mcp_servers.remem]`——与 nowledge 的 nowledgePostSetup 自查手法一致。
 */
export function rememPostSetup(): SandboxCommand {
  return async (sb, ctx) => {
    await requireCommand(sb, "remem install --target codex", "remem install --target codex");
    await requireCommand(sb, "remem model use auto", "remem model use auto");
    await requireCommand(
      sb,
      "hooks.json has SessionStart + Stop",
      'grep -q \'"SessionStart"\' "${CODEX_HOME:-$HOME/.codex}/hooks.json" && ' +
        'grep -q \'"Stop"\' "${CODEX_HOME:-$HOME/.codex}/hooks.json"',
    );
    await requireCommand(
      sb,
      "mcp_servers.remem in config.toml",
      'grep -q "mcp_servers.remem" "${CODEX_HOME:-$HOME/.codex}/config.toml"',
    );
    commandLog(ctx, "[remem] install verified: hooks (SessionStart+Stop) and MCP registered");
  };
}

/**
 * codexAgent preTeardown:核对本条 Attempt 期间记忆写路径没有塌——数据库文件仍在、hooks.json
 * 里的 Stop hook 登记仍在。remem 状态是本地文件,没有 nowledge 那种"隧道中途断线"的风险,
 * 这里只防御两类本地问题:某个失控的 Bash 命令删了 `$HOME/.remem`,或某个安装步骤中途
 * 被打断、覆盖坏了 hooks.json。抛普通 Error——按 niceeval 的失败语义,preTeardown 抛错会
 * 让 runner 把这条 Attempt 明确记为致命错误,不静默算进通过率。
 */
export function rememPreTeardown(): SandboxCommand {
  return async (sb, ctx) => {
    await requireCommand(sb, "remem store present", 'test -s "$HOME/.remem/remem.db"');
    await requireCommand(
      sb,
      "Stop hook still registered",
      'grep -q \'"Stop"\' "${CODEX_HOME:-$HOME/.codex}/hooks.json"',
    );

    // 记忆条件的核心效率信号:这条 Attempt 结束时,Stop hook 到底捕获/蒸馏了多少东西。
    // captured_events 是 Stop hook 同步跑完就有的原始捕获计数;memories 要等蒸馏(remem
    // 内部再拉起一次 codex-cli 做总结)完成才会涨,可能滞后。best-effort:status 解析失败
    // 不影响 preTeardown 的健康判定,只是拿不到这两个 fact。
    const status = await sb.runShell("remem status --json");
    if (status.exitCode === 0) {
      try {
        const parsed = JSON.parse(status.stdout) as {
          totals?: { memories?: number };
          capture_pipeline?: { captured?: number };
        };
        ctx.facts("remem.memories", String(parsed.totals?.memories ?? "unknown"));
        ctx.facts("remem.captured_events", String(parsed.capture_pipeline?.captured ?? "unknown"));
      } catch {
        // 解析失败不阻断——见上面注释
      }
    }

    commandLog(ctx, "[remem] memory store present and Stop hook still registered at preTeardown");
  };
}

/** codexAgent(...) 的 remem 配置增量;model/apiKey/baseUrl 等由实验文件自带,这里只挂 hooks + postSetup + preTeardown。 */
export function rememCodexConfig(): Pick<CodexConfig, "configFile" | "postSetup" | "preTeardown"> {
  return {
    // remem 需要 [features] hooks = true 才能让 SessionStart/Stop 生效;mcp_servers 是
    // Adapter 保留键,不写在这里——remem install 会在 postSetup 里自己往 config.toml 追加
    // [mcp_servers.remem],发生在 Adapter 自己的 setup(含保留键校验)完成之后,不冲突。
    configFile: "configs/codex/remem.toml",
    postSetup: [rememPostSetup()],
    preTeardown: [rememPreTeardown()],
  };
}
