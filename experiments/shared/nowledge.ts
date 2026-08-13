import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ExperimentFatalError } from "niceeval";
import { shared } from "niceeval/adapter";
import type { ClaudeCodeConfig, ClaudeCodePluginSpec, CodexConfig, CodexPluginSpec } from "niceeval/adapter";
import type {
  SandboxCommand,
  SandboxCommandContext,
  SandboxCommandTarget,
} from "niceeval/sandbox";

/**
 * Nowledge Mem 记忆条件:固定远程实例。
 *
 * 拓扑:mem 服务端在外部长期运行，并以可从 Docker Sandbox 访问的 URL 暴露；连接坐标
 * (NMEM_API_URL / NMEM_API_KEY)只放在 gitignored 的仓库 `.env` 或当前进程环境中，niceeval
 * 侧**不管服务端的生命周期**——不 up、不 down、无实验级启停钩子。
 * Experiment layer 的 `nowledgeAttachRemote` 每条 Attempt 接线(装 nmem CLI、把 client 指向远程、
 * 端到端探活),Agent `preTeardown` 再用 `nowledgeVerifyRemoteAlive` 核对同一个 URL 仍存活。
 *
 * 这与 mempal 的差异是形态本质:mempal 状态是文件(checkpoint 每 attempt 恢复/回存),
 * nowledge 状态在中心化 server 上按 Eval Group Space 隔离；同一 Group 内跨 attempt / 跨实验 /
 * 跨 run 持续积累，不同 Group 不共享日常读写面。
 * 由此的两条纪律:
 * - **Group 间可并发**:中心化 server 自己处理不同 Space 的并发读写；同一 Eval Group
 *   串行共享一条物理运行 lane。当前 Group 不提供业务顺序契约，因此这里只能声称状态在
 *   已实际执行的成员间持续存在，不能把某个数组位置解释成成员 N 必然读取 N-1。
 * - **每个逻辑评测流有一个 cohort 标签**:用非秘密 `NOWLEDGE_COHORT` 区分结果批次；它进入
 *   flags / fingerprint，但不参与服务端连接。未显式设置时使用本轮直连标签。
 *
 * URL 是连接坐标而不是实验身份，也绝不进入 flags、facts 或进度文本。写路径是否可用由
 * 每条 Attempt 的 prepare 与 preTeardown 探针验证，Space 名作为非秘密运行事实记录，连接坐标
 * 不复制到终端记录。
 */

export interface NowledgeEnv {
  url: string;
  apiKey: string;
}

const ENV_FILE = fileURLToPath(new URL("../../.env", import.meta.url));
const COHORT_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SERVER_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?$/;

const MISSING_ENV_HINT =
  "[nowledge] 缺 NMEM_API_URL / NMEM_API_KEY:请在仓库 .env（或进程 env）中给出已配置 mem 服务的连接坐标。" +
  "不要把这些值复制进命令、日志或源码。";

/**
 * cohort 是可公开的结果批次标签，不是 URL 或 API key。仓库 .env 只需 URL/key；默认值保证
 * 当前已配置直连无需额外环境变量即可运行。
 */
export function nowledgeCohort(): string {
  const cohort = process.env.NOWLEDGE_COHORT?.trim() || "configured-local-20260802";
  if (!COHORT_PATTERN.test(cohort)) {
    throw new Error(
      "NOWLEDGE_COHORT must be a 1-64 character lowercase instance/cohort name (letters, digits, _ or -).",
    );
  }
  return cohort;
}

/**
 * 服务端版本是运行条件。当前直连实例的已验证版本作为默认值；运维侧显式提供
 * NOWLEDGE_SERVER_VERSION 时优先采用它。
 */
export function nowledgeServerVersion(): string {
  return process.env.NOWLEDGE_SERVER_VERSION?.trim() || "0.10.48";
}

/** 真正的 Nowledge Attempt 在 prepare 验证版本格式。 */
function requireNowledgeServerVersion(): string {
  const version = nowledgeServerVersion();
  if (!SERVER_VERSION_PATTERN.test(version)) {
    throw new Error(
      `[nowledge] NOWLEDGE_SERVER_VERSION 不是可识别的服务端版本: ${JSON.stringify(version)}`,
    );
  }
  return version;
}

/**
 * 固定远程连接:进程 env 优先,回退解析仓库 .env(gitignored;兼容带/不带 `export ` 前缀)。
 * 每次调用现读——.env 里换了 URL 不需要重启任何东西。
 */
export function nowledgeEndpoint(): NowledgeEnv {
  let url = process.env.NMEM_API_URL?.trim();
  let apiKey = process.env.NMEM_API_KEY?.trim();
  if (!url || !apiKey) {
    try {
      for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
        const match = line.match(/^(?:export )?(NMEM_API_URL|NMEM_API_KEY)=(.+)$/);
        if (match?.[1] === "NMEM_API_URL") url = match[2].trim();
        if (match?.[1] === "NMEM_API_KEY") apiKey ||= match[2].trim();
      }
    } catch {
      // 落到下面的统一报错
    }
  }
  if (!url || !apiKey) throw new Error(MISSING_ENV_HINT);
  return { url: url.replace(/\/+$/, ""), apiKey };
}

/**
 * 记忆条件的实验条件,整袋进指纹:换任一个值就是换了一批被测条件,历史结果本就不该混读。
 * `memory` 区分记忆条件与 baseline,`nowledgeVersion` 让服务端升级自然作废旧结果，
 * `nowledgeCohort` 划定一轮因果连续、起点明确的远程库。URL/key 都是连接坐标，不是条件身份，
 * 不得进入 flags。
 *
 * 隧道 URL **不在这里**。它是跑起来才存在的连接坐标:换一个地址连的仍是同一个固定实例、
 * 同一个库,attempt 里发生的事一模一样,进 flags 只会让每次 cloudflared 重启作废全部已跑完的
 * 结果。cohort 而非 endpoint 会作为安全的 Attempt fact 留给报告分组。
 */
export function nowledgeFlags(): Record<string, string> {
  return {
    memory: "nowledge",
    nowledgeVersion: nowledgeServerVersion(),
    nowledgeCohort: nowledgeCohort(),
  };
}

function commandLog(ctx: SandboxCommandContext, message: string): void {
  ctx.progress({ message });
}

/** Sandbox / CLI 故障文本偶尔会回显 endpoint 或 Bearer token；Attempt 错误会进入可展示报告，先脱敏。 */
function redactNowledgeConnection(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'`]+/g, "<redacted-url>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/\bnmem_[A-Za-z0-9_-]+\b/g, "<redacted-api-key>");
}

/**
 * `shared: true` 声明这条探针的死因对全实验共享——远程实例挂了、Docker 镜像缺依赖,不是这一条
 * attempt 的运气问题,剩下的 attempt 撞上去只会同因同死。抛 `ExperimentFatalError` 让 niceeval
 * 落实验级止损闸:第一条照常 errored,余量计 unstarted、完成状态 incomplete,不再一条条烧沙箱。
 * 装包一类可能被网络抖动搞挂的步骤不带这个声明——那种失败不可证明为兄弟共享,重跑就好。
 */
async function requireCommand(
  sb: SandboxCommandTarget,
  label: string,
  script: string,
  opts: {
    shared?: boolean;
    env?: Readonly<Record<string, string>>;
  } = {},
): Promise<void> {
  const result = await sb.runShell(script, opts.env === undefined ? undefined : { env: opts.env });
  if (result.exitCode !== 0) {
    const tail = redactNowledgeConnection((result.stderr || result.stdout).trim().slice(-500)) || "no output";
    const message = `[nowledge] ${label} failed (exit ${result.exitCode}): ${tail}`;
    throw opts.shared ? new ExperimentFatalError(message) : new Error(message);
  }
}

/**
 * prepare 当时接入的 cohort，按 sandbox 键控(并发 Attempt 各有自己的 sandbox)。每条 Sandbox
 * 的 nmem 客户端配置在 prepare 时写死，preTeardown 只读该配置探活，绝不现读宿主 .env（否则
 * 隧道中途换地址会把旧连接的失败伪装成新连接健康）。
 */
const attemptConditions = new WeakMap<
  object,
  { cohort: string; serverVersion: string; space: string }
>();

function evalGroupSpace(ctx: SandboxCommandContext): string {
  if (ctx.evalGroup === undefined) {
    throw new Error("[nowledge] Eval Group context is required to isolate the Nowledge Space.");
  }
  return ctx.evalGroup.id;
}

function nowledgeEnv(space: string): Readonly<Record<string, string>> {
  return Object.freeze({ NMEM_SPACE: space });
}

async function ensureNowledgeSpace(
  sb: SandboxCommandTarget,
  space: string,
): Promise<void> {
  const env = nowledgeEnv(space);
  const show = await sb.runCommand("nmem", ["--json", "spaces", "show", space], { env });
  if (show.exitCode === 0) return;
  const create = await sb.runCommand(
    "nmem",
    ["--json", "spaces", "create", space, "--retrieval-mode", "strict"],
    { env },
  );
  if (create.exitCode === 0) return;
  // 两个 Invocation 同时第一次命中同一 Group 时，另一边可能刚创建成功。回读一次再判失败。
  const raced = await sb.runCommand("nmem", ["--json", "spaces", "show", space], { env });
  if (raced.exitCode === 0) return;
  const tail = redactNowledgeConnection(
    (create.stderr || create.stdout || raced.stderr || raced.stdout).trim().slice(-500),
  ) || "no output";
  throw new ExperimentFatalError(`[nowledge] cannot create or resolve Space ${JSON.stringify(space)}: ${tail}`);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/** 让整个 Agent CLI 进程及其 hooks、MCP env_http_headers 与 nmem 子进程使用当前 Group Space。 */
function bindAgentToNowledgeSpace(binName: "codex" | "claude"): SandboxCommand {
  return async (sb, ctx) => {
    const space = evalGroupSpace(ctx);
    const resolved = await sb.runShell(
      `if [ -x "$HOME/.local/bin/${binName}" ]; then printf '%s' "$HOME/.local/bin/${binName}"; else command -v ${binName}; fi`,
    );
    const bin = resolved.stdout.trim();
    if (resolved.exitCode !== 0 || !bin) {
      throw new Error(`[nowledge] cannot resolve ${binName} binary for Space binding`);
    }
    const real = `${bin}.niceeval-nowledge-real`;
    const marker = await sb.runCommand("grep", ["-q", "NICEEVAL_NOWLEDGE_SPACE_WRAPPER", bin]);
    if (marker.exitCode !== 0) {
      const moved = await sb.runCommand("mv", ["-f", bin, real]);
      if (moved.exitCode !== 0) {
        throw new Error(
          `[nowledge] cannot preserve real ${binName} binary: ${(moved.stderr || moved.stdout).trim().slice(-500)}`,
        );
      }
    }
    await sb.writeText(
      bin,
      [
        "#!/bin/sh",
        "# NICEEVAL_NOWLEDGE_SPACE_WRAPPER",
        `export NMEM_SPACE=${shellQuote(space)}`,
        `exec ${shellQuote(real)} "$@"`,
        "",
      ].join("\n"),
    );
    await requireCommand(sb, `${binName} Space wrapper executable`, `chmod 755 ${shellQuote(bin)}`);
    ctx.facts("nowledge.space", space);
    commandLog(ctx, `[nowledge] ${binName} bound to Space ${space}`);
  };
}

/**
 * Experiment layer prepare command(每 Attempt 一次):装 nmem CLI 并把 client 指向固定远程实例,跑在 Agent postSetup 之前,
 * 这样 postSetup 里插件的 install_hooks.py 能从 nmem client 配置读到远程连接。
 */
export function nowledgeAttachRemote(endpoint: () => NowledgeEnv = nowledgeEndpoint): SandboxCommand {
  return async (sb, ctx) => {
    const cohort = nowledgeCohort();
    const serverVersion = requireNowledgeServerVersion();
    const space = evalGroupSpace(ctx);
    const conn = endpoint();
    attemptConditions.set(sb, { cohort, serverVersion, space });
    ctx.facts("nowledge.cohort", cohort);
    ctx.facts("nowledge.server-version", serverVersion);
    ctx.facts("nowledge.space", space);

    // 插件的 lifecycle hooks 与 install_hooks.py 都要 python3。Docker 镜像里没有就是全实验没有。
    await requireCommand(sb, "python3 probe", "command -v python3", { shared: true });

    // nmem-cli 是 ~12MB 的单二进制 wheel,attempt 级安装可接受。它与 server/flags 同版本钉住，
    // 避免 client/server 漂移悄悄改变 memory 条件；uv 优先,pip 兜底。
    await requireCommand(
      sb,
      "nmem-cli install",
      `if command -v nmem >/dev/null 2>&1 && [ "$(nmem --version 2>/dev/null)" = "nmem ${serverVersion}" ]; then exit 0; fi; uv tool install --force 'nmem-cli==${serverVersion}' >/dev/null 2>&1 || pip install --user -q --upgrade 'nmem-cli==${serverVersion}'`,
    );
    // hooks 用 shutil.which("nmem") 找 CLI,别赌 codex 进程的 PATH 含 ~/.local/bin
    await requireCommand(
      sb,
      "nmem on PATH",
      `nmem_bin="$HOME/.local/bin/nmem"; test -x "$nmem_bin" || nmem_bin="$(command -v nmem 2>/dev/null || true)"; test -n "$nmem_bin" && "$nmem_bin" --version 2>/dev/null | grep -Fx 'nmem ${serverVersion}'; sudo -n ln -sf "$nmem_bin" /usr/local/bin/nmem 2>/dev/null || ln -sf "$nmem_bin" /usr/local/bin/nmem; nmem --version 2>/dev/null | grep -Fx 'nmem ${serverVersion}'`,
    );

    // nmem CLI 的 client config 是 $HOME/.nowledge-mem/config.json。不要用 `nmem config client set`
    // 写它：那会把 URL/key 插值进可由 `niceeval show --timing` 呈现的 shell 命令。文件 API 不记录
    // 内容到 shell evidence，且这份配置只在 agent 的 home 内可见。
    const home = (await sb.runShell('printf "%s" "$HOME"')).stdout.trim();
    if (!home) throw new Error("[nowledge] cannot resolve sandbox HOME for nmem client config");
    await requireCommand(sb, "nmem config directory", 'mkdir -p "$HOME/.nowledge-mem"');
    await sb.writeText(
      `${home}/.nowledge-mem/config.json`,
      `${JSON.stringify({ apiUrl: conn.url, apiKey: conn.apiKey }, null, 2)}\n`,
    );
    await ensureNowledgeSpace(sb, space);
    // 端到端探活:隧道挂了在这里死,不浪费 agent.setup 和模型调用。远程实例是全实验共享的
    // 单点,它挂了整批必死——声明 shared 让止损闸停掉余量,而不是 36 条 attempt 一条条撞。
    await requireCommand(
      sb,
      "nowledge server probe",
      "nmem --json status",
      { shared: true, env: nowledgeEnv(space) },
    );
    commandLog(ctx, `[nowledge] nmem ${serverVersion} client ready for cohort ${cohort}, Space ${space}`);
  };
}

/**
 * Agent preTeardown 探针:每条 Attempt 在 Agent 收尾前再探一次**prepare 当时连的那个 URL**。
 *
 * 堵的洞(2026-07-24 实测):Nowledge Mem.app 拉的是 cloudflare quick tunnel
 * (`cloudflared tunnel --url`),随机域名、无 SLA、进程一重连就换地址。prepare 的探活只证明
 * attempt **开头**隧道活着;URL 一旦在 attempt 中途变掉,codex 的 MCP 配置已写死指向旧域名,
 * 此后每次 memory_add 都失败(trace 里是 `error.type: mcp_request`,events.json 里只剩
 * `"output": null, "status": "failed"`,没有任何错误文本),而 attempt 照常判 pass/fail
 * 进通过率——那一轮 36 条里 memory_add 挂了 11/29,记忆条件名存实亡,数字却看不出异常。
 *
 * 抛普通 Error 而非 ExperimentFatalError:URL 换掉后,后续 Attempt 的 prepare 现读 .env
 * 会拿到新地址并正常工作,中毒的只有正在跑的这一条。按 niceeval 的失败语义,preTeardown 抛错
 * 由 runner 记为致命错误,这条 attempt 不会被静默算进通过率——记忆写路径完好是记忆条件
 * 实验「结果成立的必要条件」,不是可选的收尾动作。
 */
export function nowledgeVerifyRemoteAlive(): SandboxCommand {
  return async (sb, ctx) => {
    const condition = attemptConditions.get(sb);
    // prepare 没走到:没有可核对的基准,不额外报错
    if (!condition) return;

    const result = await sb.runShell("nmem --json status", { env: nowledgeEnv(condition.space) });
    if (result.exitCode !== 0) {
      const tail = redactNowledgeConnection((result.stderr || result.stdout).trim().slice(-300)) || "no output";
      throw new Error(
        `[nowledge] 收尾探针失败:cohort ${condition.cohort}（server ${condition.serverVersion}）在本条 attempt 期间已不可达(exit ${result.exitCode}: ${tail})。` +
          `隧道在 attempt 期间断开或配置失效,期间的 memory_add / memory_search 全部落空,` +
          `本条的记忆条件不成立。修复该 cohort 的连接后，以新的干净 cohort 重跑本条。`,
      );
    }
    commandLog(
      ctx,
      `[nowledge] cohort ${condition.cohort}, Space ${condition.space} (server ${condition.serverVersion}) still reachable at preTeardown`,
    );
  };
}

/** codex 原生插件(skills + lifecycle hooks 声明);sparse 路径对齐 nowledge 官方安装命令。 */
export const nowledgePlugin: CodexPluginSpec = {
  marketplace: {
    name: "nowledge-community",
    source: "nowledge-co/community",
    sparse: [".agents", "nowledge-mem-codex-plugin"],
  },
  name: "nowledge-mem",
};

/**
 * postSetup:跑插件自带的 install_hooks.py——把 Stop hook 和远程 MCP 块装进全局配置。
 * Sandbox prepare 已先写 nmem client config，插件是唯一的 MCP 配置作者，避免 Adapter 把
 * Authorization header 作为 shell 文本写入可展示的 agent setup 记录。
 */
export function nowledgePostSetup(): SandboxCommand {
  return async (sb, ctx) => {
    const space = evalGroupSpace(ctx);
    const locate = await sb.runShell(
      'find "${CODEX_HOME:-$HOME/.codex}" -type f -name install_hooks.py -path "*nowledge-mem*" 2>/dev/null | head -1',
    );
    const script = locate.stdout.trim();
    if (!script) throw new Error("[nowledge] 找不到插件的 install_hooks.py——plugin 安装产物不在预期位置");

    await requireCommand(sb, "install_hooks.py", `python3 '${script}'`, { env: nowledgeEnv(space) });

    // nowledge 文档的可选步骤「插件 AGENTS.md 合并进项目根」——对 benchmark 是行为组成部分,
    // 缺了会静默削弱读路径,按硬依赖处理。appendProjectInstruction 只在 AGENTS.md 是
    // adapter 新建时才写 .git/info/exclude,workspace 原有的不排除,零 diff 噪音。
    const agentsMd = await sb.runShell(`cat "$(dirname "$(dirname '${script}')")/AGENTS.md"`);
    if (agentsMd.exitCode !== 0 || !agentsMd.stdout.trim()) {
      throw new Error("[nowledge] 插件目录里找不到 AGENTS.md——插件结构变了,检查合并步骤是否还适用");
    }
    await shared.appendProjectInstruction(sb, agentsMd.stdout);

    // 自查三件套:全局 hooks.json、features.hooks、插件写入的 MCP 段
    await requireCommand(
      sb,
      "hooks.json present",
      'test -f "${CODEX_HOME:-$HOME/.codex}/hooks.json"',
    );
    await requireCommand(
      sb,
      "mcp_servers.nowledge-mem in config.toml",
      'grep -q "mcp_servers.nowledge-mem" "${CODEX_HOME:-$HOME/.codex}/config.toml"',
    );
    commandLog(ctx, "[nowledge] plugin hooks installed and config verified");
  };
}

/**
 * 连接由 prepare 写入的 nmem client config 提供；Agent 进程、Session hooks、MCP 动态 header
 * 与 agent 内 nmem CLI 都使用当前 Eval Group 对应的 Space。
 */
export function nowledgeCodexConfig(): Pick<
  CodexConfig,
  "env" | "plugins" | "configFile" | "postSetup" | "preTeardown"
> {
  return {
    env: {},
    plugins: [nowledgePlugin],
    // [features] plugins = true 必须在 codex plugin add 之前落盘(adapter 先写 configFile 再装 plugin)
    configFile: "configs/codex/nowledge.toml",
    postSetup: [nowledgePostSetup(), bindAgentToNowledgeSpace("codex")],
    preTeardown: [nowledgeVerifyRemoteAlive()],
  };
}

// ── CLI-only 变体(诊断用)────────────────────────────────────────────────
// 背景:compare/codex-gpt-5.4--nowledge 实测 8 个 attempt 里只有 1 个真的调用了
// nowledge-mem MCP 工具,其余全零——但 MCP 调用本身是模型工具调用流里可见的事件,
// 唯一不可观测的是 hook(SessionStart/Stop)shell out 到 nmem CLI 那部分。这个变体反过来:
// 彻底不给 MCP,逼 agent 只能自己在 Bash 里敲 `nmem` 命令——如果它敲了,niceeval 的
// events.json 里就能直接搜到 `nmem`,不再需要查服务端才能实锤。
// 用于诊断"低利用率是不是任务本身不像 continuation work",不是要否定官方 MCP 优先的推荐
// (mem.nowledge.co/zh/docs/integrations/codex-cli 明确说 MCP 更顺手、CLI 只是宿主级兜底)。

const MCP_MANAGED_BEGIN = "# BEGIN Nowledge Mem MCP (managed by nowledge-mem-codex-plugin)";
const MCP_MANAGED_END = "# END Nowledge Mem MCP";

/** 覆盖 AGENTS.md 里"优先用 MCP"的默认引导;因为这个变体从没给 MCP,原文档的优先级判断会误导 agent。 */
const CLI_ONLY_OVERRIDE = `## CLI-Only Override (this benchmark environment)

Nowledge Mem MCP tools are NOT installed in this session — \`memory_search\`, \`memory_add\`,
\`thread_search\`, \`thread_fetch_messages\`, \`read_context_bundle\`, \`mem_fs\`, and
\`find_skills\`/\`report_skill_outcome\` do not exist here and will fail if called.

For every memory operation described above in this document, use the \`nmem\` CLI directly via
the shell instead of the MCP tool it names:

- Startup context: \`nmem --json context --source-app codex\` (or \`nmem --json wm read\` for just
  Working Memory)
- Search durable knowledge: \`nmem --json m search "query"\`
- Search prior threads: \`nmem --json t search "query" --limit 5\`
- Save a durable memory: \`nmem --json m add "content" -t "Title" --unit-type decision -l "label" -s codex -i 0.8\`
- Update an existing one: \`nmem --json m update <memory_id> -c "updated content"\`

Everything else in this document about *when* to search or save still applies — only the
mechanism changes from an MCP tool call to an \`nmem\` shell command.
`;

/**
 * install_hooks.py 装完托管 MCP 段之后,把它删掉,逼 codex 只剩 CLI 一条路。
 * `nmem config mcp show --host codex` 在 nmem client 已指向远程时总会成功,所以
 * install_hooks.py 总会写这个块——不能靠"不给 endpoint"跳过,只能装完之后再删。
 * 删除后验证 config.toml 里确实没有残留,再把 override 追加进 AGENTS.md。
 */
export function nowledgeCliOnlyPostSetup(): SandboxCommand {
  return async (sb, ctx) => {
    const configFile = '"${CODEX_HOME:-$HOME/.codex}/config.toml"';
    await requireCommand(
      sb,
      "strip managed MCP block",
      `sed -i '/^${MCP_MANAGED_BEGIN}$/,/^${MCP_MANAGED_END}$/d' ${configFile}`,
    );
    await requireCommand(sb, "MCP block gone from config.toml", `! grep -q "mcp_servers.nowledge-mem" ${configFile}`);
    await shared.appendProjectInstruction(sb, CLI_ONLY_OVERRIDE);
    commandLog(ctx, "[nowledge] MCP block stripped — CLI-only mode, AGENTS.md override appended");
  };
}

/** codexAgent(...) 的 CLI-only 变体:装插件 + hooks,但不注册 MCP,读写全走 `nmem` CLI。 */
export function nowledgeCodexCliOnlyConfig(): Pick<
  CodexConfig,
  "env" | "plugins" | "configFile" | "postSetup" | "preTeardown"
> {
  return {
    env: {},
    plugins: [nowledgePlugin],
    configFile: "configs/codex/nowledge.toml",
    postSetup: [nowledgePostSetup(), nowledgeCliOnlyPostSetup(), bindAgentToNowledgeSpace("codex")],
    preTeardown: [nowledgeVerifyRemoteAlive()],
  };
}

// ── Claude Code 侧 ──────────────────────────────────────────────────────────
// codex 集成的所有摩擦(远程 HTTP MCP 表达不了、无 post-agent-setup hook 跑 install_hooks.py、
// hooks 需 --dangerously-bypass-hook-trust)在 claude-code 这里全不存在:
//   · 插件官方 hooks.json 已声明 SessionStart(读)/UserPromptSubmit(读指引)/Stop(写),
//     `claude plugin install` 装上即生效,不需要独立 install 脚本;
//   · 读写两条路径都 shell out 到 nmem CLI(SessionStart→nmem-hook-read.sh、Stop→nmem-hook-save.py),
//     CLI 读 `nmem config client` 的 url/api-key —— 正好是 nowledgeAttachRemote()
//     已指向远程实例的那份配置;
//   · 插件根无 .mcp.json,没有 localhost MCP 要覆盖,所以核心记忆环不叠远程 MCP。
//     (MCP 只服务可选的 skills 匹配 find_skills / report_skill_outcome,记忆本身用不到。)
// 因此 claude 变体 = nowledgeAttachRemote()(装 nmem CLI + 设 client 指向远程)+ 装官方插件,句号——
// nowledgeClaudeConfig() 本身不需要连接信息,不接收 endpoint 参数。

/**
 * Claude Code 原生插件。marketplace name 必须是 `nowledge-community`(仓库 marketplace manifest
 * 注册的名字,adapter 会回读 `claude plugin marketplace list` 校验),对应官方安装命令
 * `claude plugin install nowledge-mem@nowledge-community`。ref 不钉,与 codex 变体一致取默认分支。
 */
export const nowledgeClaudePlugin: ClaudeCodePluginSpec = {
  marketplace: { name: "nowledge-community", source: "nowledge-co/community" },
  name: "nowledge-mem",
};

/** claudeCodeAgent(...) 的 Nowledge Mem 配置增量;apiKey/baseUrl 等由实验文件自带,这里只叠插件。 */
export function nowledgeClaudeConfig(): Pick<ClaudeCodeConfig, "plugins" | "postSetup" | "preTeardown"> {
  return {
    plugins: [nowledgeClaudePlugin],
    postSetup: [bindAgentToNowledgeSpace("claude")],
    preTeardown: [nowledgeVerifyRemoteAlive()],
  };
}
