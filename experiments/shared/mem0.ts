import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ExperimentFatalError } from "niceeval";
import { shared } from "niceeval/adapter";
import type { CodexConfig, CodexPluginSpec, McpServer, SkillSpec } from "niceeval/adapter";
import type { Sandbox, SandboxHook, SandboxHookContext } from "niceeval/sandbox";

/**
 * Mem0 记忆条件:固定远程 Mem0 Platform(mcp.mem0.ai)。
 *
 * 拓扑与 nowledge 同构——状态在中心化云端跨 attempt / 跨实验持续积累;niceeval 侧不管
 * 服务端生命周期。连接坐标(MEM0_API_KEY / 可选 MEM0_USER_ID)固定放仓库 .env(gitignored)。
 *
 * Codex 官方集成有两条路(见 https://docs.mem0.ai/integrations/codex):
 * - Direct MCP:`bearer_token_env_var = "MEM0_API_KEY"`
 * - Plugin marketplace:`mem0@mem0-plugins`(+ opt-in `install_codex_hooks.py`)
 *
 * 本仓库走「插件 + 显式 MCP headers」:
 * 1. 装官方插件(skills + hooks 模板);
 * 2. factory 再写一份带 `Authorization: Token …` 的 HTTP MCP(niceeval 的 `mcpServers.headers`
 *    形态)——**不**依赖 `bearer_token_env_var`,因为 `codexAgent` 的 `send()` 只注入
 *    `CODEX_API_KEY`,沙箱进程里没有 `MEM0_API_KEY`(候选上游 FR:adapter 支持额外 env);
 * 3. postSetup 跑官方 `install_codex_hooks.py`,再剥掉插件自带的 bearer_token MCP 段避免重复,
 *    并把 key 落到 `~/.bashrc` / `~/.profile` / `~/.mem0/config.json`,让 hooks 的
 *    `_identity.sh` 回退路径能读到。
 *
 * 鉴权前缀注意:Mem0 REST API 要 `Authorization: Token <key>`(Bearer → 401);MCP 端点两者
 * 都收。headers 一律用 Token,跟插件 `.mcp.json` / `.cursor-mcp.json` 对齐。
 */

/** 记进 flags 做 provenance;升级 Mem0 Platform / 插件契约时更新。 */
export const MEM0_VERSION = "platform-mcp-1.28";

/** Mem0 远程 Streamable HTTP MCP。 */
export const MEM0_MCP_URL = "https://mcp.mem0.ai/mcp/";

export interface Mem0Env {
  apiKey: string;
  /** 记忆隔离作用域;默认读 Agent Mode 签发的 default_user_id,否则 memorybench。 */
  userId: string;
}

const ENV_FILE = fileURLToPath(new URL("../../.env", import.meta.url));

const MISSING_ENV_HINT =
  "[mem0] 缺 MEM0_API_KEY:在仓库 .env(或进程 env)里给出 Mem0 Platform API key" +
  "(以 m0- 开头)。无账号时可在本机跑 `npx @mem0/cli init --agent --agent-caller memorybench --json`" +
  "签发 Agent Mode key,再把 key 写进 .env。";

/**
 * 固定远程连接:进程 env 优先,回退解析仓库 .env(gitignored;兼容带/不带 `export ` 前缀)。
 * 每次调用现读——.env 里换了 key 不需要重启任何东西。
 */
export function mem0Endpoint(): Mem0Env {
  let apiKey = process.env.MEM0_API_KEY?.trim();
  let userId = process.env.MEM0_USER_ID?.trim();
  if (!apiKey || !userId) {
    try {
      for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
        const match = line.match(/^(?:export )?(MEM0_API_KEY|MEM0_USER_ID)=(.+)$/);
        if (match?.[1] === "MEM0_API_KEY") apiKey ||= match[2].trim();
        if (match?.[1] === "MEM0_USER_ID") userId ||= match[2].trim();
      }
    } catch {
      // 落到下面的统一报错
    }
  }
  if (!apiKey) throw new Error(MISSING_ENV_HINT);
  return { apiKey, userId: userId || "memorybench" };
}

/** 报告分组用的实验事实。userId 进 flags 做 provenance(换 cohort 时能看出)。 */
export function mem0Flags(): Record<string, string> {
  let userId = "unset";
  try {
    userId = mem0Endpoint().userId;
  } catch {
    // 沙箱 setup 会硬失败并给出 MISSING_ENV_HINT
  }
  return { memory: "mem0", mem0Version: MEM0_VERSION, mem0UserId: userId };
}

/**
 * `mem0UserId` 是这轮记忆隔离作用域的出处记录:换 cohort / 换 Agent Mode 账号会变,
 * 但评测逻辑不变。声明成 provenance flag 留在报告里、不进指纹。
 */
export const MEM0_PROVENANCE_FLAGS = ["mem0UserId"];

/** 教 agent 在评测里何时 search / add(比插件自带的 /mem0:* slash 技能更贴 headless codex)。 */
export const mem0Skill: SkillSpec = {
  kind: "local",
  path: "experiments/shared/mem0-skill",
  name: "mem0-memory",
};

function hookLog(ctx: SandboxHookContext, message: string): void {
  ctx.progress({ message });
}

async function requireCommand(
  sb: Sandbox,
  label: string,
  script: string,
  opts: { shared?: boolean } = {},
): Promise<void> {
  const result = await sb.runShell(script);
  if (result.exitCode !== 0) {
    const tail = (result.stderr || result.stdout).trim().slice(-500) || "no output";
    const message = `[mem0] ${label} failed (exit ${result.exitCode}): ${tail}`;
    throw opts.shared ? new ExperimentFatalError(message) : new Error(message);
  }
}

/** setup 当时这条 attempt 实际用的 key 指纹(不落明文),teardown 探活用同一把。 */
const attemptKeys = new WeakMap<Sandbox, string>();

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * 沙箱级接线(每沙箱一次):把 API key 落到 hooks 能读到的位置,并端到端探活 MCP。
 * 跑在 agent.setup 之前。
 */
export function mem0AttachRemote(endpoint: () => Mem0Env = mem0Endpoint): SandboxHook {
  return async (sb, ctx) => {
    const conn = endpoint();
    attemptKeys.set(sb, conn.apiKey);

    await requireCommand(sb, "python3 probe", "command -v python3", { shared: true });

    // hooks 的 _identity.sh 会 grep ~/.bashrc / ~/.profile 回退读 key(codex send() 不传 MEM0_*)。
    const profileBlock =
      `export MEM0_API_KEY=${shellQuote(conn.apiKey)}\n` + `export MEM0_USER_ID=${shellQuote(conn.userId)}\n`;
    await requireCommand(
      sb,
      "write shell profile exports",
      `for f in "$HOME/.bashrc" "$HOME/.profile"; do ` +
        `touch "$f"; ` +
        `grep -q '^export MEM0_API_KEY=' "$f" 2>/dev/null || printf '%s' ${shellQuote(profileBlock)} >> "$f"; ` +
        `done`,
    );

    // 官方 SDK / 部分 hook 脚本也会读 ~/.mem0/config.json
    const configJson = JSON.stringify({
      version: 1,
      defaults: { user_id: conn.userId, agent_id: "", app_id: "", run_id: "" },
      platform: {
        api_key: conn.apiKey,
        base_url: "https://api.mem0.ai",
        agent_mode: true,
        created_via: "memorybench",
        default_user_id: conn.userId,
      },
    });
    await requireCommand(
      sb,
      "write ~/.mem0/config.json",
      `mkdir -p "$HOME/.mem0" && printf '%s\\n' ${shellQuote(configJson)} > "$HOME/.mem0/config.json" && chmod 600 "$HOME/.mem0/config.json"`,
    );

    // 端到端探活:沙箱出网 + Token 鉴权。Mem0 Platform 是全实验共享单点——挂了整批必死。
    await requireCommand(
      sb,
      "MCP probe(https://mcp.mem0.ai/mcp/;挂了则 Mem0 Platform / 出网已死)",
      `curl -sS -o /tmp/mem0-mcp-probe.json -w '%{http_code}' -X POST ${shellQuote(MEM0_MCP_URL)} ` +
        `-H ${shellQuote(`Authorization: Token ${conn.apiKey}`)} ` +
        `-H 'Content-Type: application/json' ` +
        `-H 'Accept: application/json, text/event-stream' ` +
        `-d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"memorybench","version":"0"}}}' ` +
        `| grep -q '^200$'`,
      { shared: true },
    );
    hookLog(ctx, `[mem0] client ready → ${MEM0_MCP_URL} (user=${conn.userId})`);
  };
}

/**
 * 收尾探针:attempt 跑完、沙箱销毁前,再探一次 Mem0 MCP。
 * 中途 Platform 故障会让 add_memory / search_memories 静默全挂,本条记忆条件不成立。
 */
export function mem0VerifyRemoteAlive(): SandboxHook {
  return async (sb, ctx) => {
    const apiKey = attemptKeys.get(sb);
    if (!apiKey) return;

    const result = await sb.runShell(
      `curl -sS -o /tmp/mem0-mcp-teardown.json -w '%{http_code}' -X POST ${shellQuote(MEM0_MCP_URL)} ` +
        `-H ${shellQuote(`Authorization: Token ${apiKey}`)} ` +
        `-H 'Content-Type: application/json' ` +
        `-H 'Accept: application/json, text/event-stream' ` +
        `-d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"memorybench-teardown","version":"0"}}}'`,
    );
    const httpCode = result.stdout.trim();
    if (result.exitCode !== 0 || httpCode !== "200") {
      throw new Error(
        `[mem0] 收尾探针失败:Mem0 MCP 在 attempt 期间不可达(http ${httpCode || "???"})。` +
          `期间的 add_memory / search_memories 可能落空,本条的记忆条件不成立。`,
      );
    }
    hookLog(ctx, `[mem0] MCP still reachable at teardown → ${MEM0_MCP_URL}`);
  };
}

/**
 * 远程 HTTP MCP。url/headers 用 getter 惰性求值:adapter 在 agent.setup 才读这些字段。
 * 鉴权用 Token 前缀(与插件 .mcp.json 一致;REST API 拒 Bearer)。
 */
export function mem0McpServer(endpoint: () => Mem0Env = mem0Endpoint): McpServer {
  return {
    name: "mem0",
    get url() {
      return MEM0_MCP_URL;
    },
    get headers() {
      return { Authorization: `Token ${endpoint().apiKey}` };
    },
  };
}

/** codex 原生插件;marketplace 名必须是仓库 manifest 注册的 `mem0-plugins`。 */
export const mem0Plugin: CodexPluginSpec = {
  marketplace: {
    name: "mem0-plugins",
    source: "mem0ai/mem0",
    // 大仓库只取插件路径;marketplace.json 在 .agents/plugins/。
    sparse: [".agents", "integrations/mem0-plugin"],
  },
  name: "mem0",
};

/**
 * postSetup:装官方 hooks,剥掉插件自带的 bearer_token MCP(与 factory headers 重复),
 * 合并评测用的记忆协议指引。
 */
export function mem0PostSetup(endpoint: () => Mem0Env = mem0Endpoint): SandboxHook {
  return async (sb, ctx) => {
    const conn = endpoint();

    const locate = await sb.runShell(
      'find "${CODEX_HOME:-$HOME/.codex}" -type f -name install_codex_hooks.py -path "*mem0*" 2>/dev/null | head -1',
    );
    const script = locate.stdout.trim();
    if (!script) {
      throw new Error("[mem0] 找不到插件的 install_codex_hooks.py——plugin 安装产物不在预期位置");
    }

    await requireCommand(sb, "install_codex_hooks.py", `python3 '${script}'`);

    // 插件 .codex-mcp.json 会再写 bearer_token_env_var;factory 已用 http_headers。
    // 统一收成「只留 Token headers」,避免同名表合并后两种鉴权并存、且 env 里没有 MEM0_API_KEY。
    // 脚本先落到沙箱临时文件再执行,避开 python -c 的引号地狱。
    const rewritePy =
      "from pathlib import Path\n" +
      "import os, re\n" +
      "api_key = " +
      JSON.stringify(conn.apiKey) +
      "\n" +
      "mcp_url = " +
      JSON.stringify(MEM0_MCP_URL) +
      "\n" +
      'p = Path(os.path.expanduser(os.environ.get("CODEX_HOME", "~/.codex"))) / "config.toml"\n' +
      "text = p.read_text()\n" +
      "text = re.sub(r'(?m)^\\s*bearer_token_env_var\\s*=.*\\n?', '', text)\n" +
      "if 'mcp_servers.mem0.http_headers' not in text or 'Authorization' not in text:\n" +
      "    text = text.rstrip() + '\\n\\n'\n" +
      "    text += f'[mcp_servers.mem0]\\nurl = \"{mcp_url}\"\\n\\n'\n" +
      "    text += '[mcp_servers.mem0.http_headers]\\n'\n" +
      "    text += f'\"Authorization\" = \"Token {api_key}\"\\n'\n" +
      "p.write_text(text if text.endswith('\\n') else text + '\\n')\n";
    await requireCommand(
      sb,
      "write MCP normalize script",
      `printf '%s' ${shellQuote(rewritePy)} > /tmp/mem0-normalize-mcp.py`,
    );
    await requireCommand(sb, "normalize mem0 MCP to Token http_headers", "python3 /tmp/mem0-normalize-mcp.py");

    await requireCommand(
      sb,
      "hooks.json present",
      'test -f "${CODEX_HOME:-$HOME/.codex}/hooks.json"',
    );
    await requireCommand(
      sb,
      "mcp_servers.mem0 in config.toml",
      'grep -q "mcp_servers.mem0" "${CODEX_HOME:-$HOME/.codex}/config.toml"',
    );

    // 评测协议:何时 search / 存什么。appendProjectInstruction 只在 adapter 新建 AGENTS.md 时排除。
    await shared.appendProjectInstruction(
      sb,
      [
        "## Mem0 memory (benchmark)",
        "",
        `Use the \`mem0\` MCP tools (\`search_memories\`, \`add_memory\`). Default user_id: \`${conn.userId}\`.`,
        "Search once at task start; add a short durable lesson before you finish if one exists.",
        "Do not store benchmark answers or hidden-test guesses — only reusable engineering why.",
        "",
      ].join("\n"),
    );

    hookLog(ctx, "[mem0] plugin hooks installed; MCP uses Token http_headers");
  };
}

/** codexAgent(...) 的 Mem0 配置增量。 */
export function mem0CodexConfig(
  endpoint: () => Mem0Env = mem0Endpoint,
): Pick<CodexConfig, "mcpServers" | "plugins" | "skills" | "configFile" | "postSetup"> {
  return {
    mcpServers: [mem0McpServer(endpoint)],
    plugins: [mem0Plugin],
    skills: [mem0Skill],
    // [features] plugins = true 必须在 codex plugin add 之前落盘
    configFile: "configs/codex/mem0.toml",
    postSetup: [mem0PostSetup(endpoint)],
  };
}
