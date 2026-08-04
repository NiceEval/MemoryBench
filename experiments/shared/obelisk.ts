import type { SkillSpec } from "niceeval/adapter";
import type { Sandbox, SandboxCommand, SandboxHook, SandboxHookContext } from "niceeval/sandbox";

/**
 * Obelisk 记忆条件:官方 Node CLI(`@obelisk-apps/cli`)把 `~/.codex/sessions`(以及
 * `~/.claude/`)的会话 transcript 索引进本地 `~/.obelisk/obelisk.sqlite`(SQLite + FTS5),
 * 配套的 Claude/Codex 通用 Skill 教 agent 写小段 JS 查询脚本、经 `obelisk --query <file>`
 * 或 `obelisk --search "text"` 检索自己的历史会话。
 *
 * 记忆语义(v1):状态本应就是 `$HOME` 下的 `~/.codex/sessions` + `~/.obelisk`，但实测
 * codex adapter 的 per-attempt agent setup 会把整个 `$HOME` 重置（文件头「已修:$HOME 整个
 * 不跨 Attempt 原生持续」段有完整调查记录，包括先按"只有 sessions 被清"接了一版、被冒烟证伪
 * 的过程），所以实际状态落在 `obeliskArchiveSessions()` / `obeliskRestoreSessions()` 维护的
 * `/opt/obelisk-session-archive`——这个目录特意选在 `$HOME` 之外，同一台 sandboxReuse 复用的
 * 物理沙箱内，`preTeardown` 把每条 Attempt 写下的会话搬进这个 codex 不会碰、也不受 `$HOME`
 * 重置影响的目录，下一条 Attempt 的 `postSetup` 再搬回新 `~/.codex/sessions`。本条件**不做
 * 跨 run 回存**——每次全新 Invocation 从零开始，归档目录本身也在物理沙箱销毁时一并消失，没有
 * mempal 那种 host 侧 checkpoint tgz，也没有 nowledge 那种远程库；`maxConcurrency: 1` 保证
 * 同一物理沙箱内题目严格串行，归档到的会话历史顺序即真实作答顺序。
 *
 * 2026-08-04 手工验证（`docker run niceeval/codex:0.144.1-r3`，全局装
 * `@obelisk-apps/cli@0.2.2`）确认的行为，供后续排障参考：
 * - 不需要跑 `obelisk install`——那是把 Skill 文档装进项目/全局的命令，我们改用 niceeval 的
 *   `codexAgent({ skills })` 机制装 Skill，CLI 本身首次调用 `--search`/`--query` 时
 *   自动在 `~/.obelisk/obelisk.sqlite` 建库，不需要显式初始化。
 * - 真实 `codex exec`（哪怕 API key 无效、模型调用最终失败）也会先把
 *   `session_meta` / `event_msg` / `response_item` 等事件落盘到
 *   `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`，obelisk 能正确解析索引；
 *   验证时无需真实模型访问，一条会因 401 重试耗尽而失败的 `codex exec` 就足够造出可索引的会话。
 * - 后续调用一般会增量捡到新会话（官方文档「First run builds the index. Later runs
 *   update incrementally.」），但紧邻同一秒内造会话、不等落盘就立刻查询，观测到过一次
 *   命中失败、需要显式 `obelisk --build`（约 0.6s）才刷新的情况——真实 Attempt 之间的间隔
 *   （沙箱题间 reset、Agent setup/teardown）远超这个量级，不需要额外 workaround；这里只是
 *   记录下来，供冒烟阶段"第二条 attempt 查不到第一条"时先排除这条时序原因。
 *
 * **已修（2026-08-04，agent 命令子进程 PATH 缺口）：** 冒烟 react-tooltip/ 时发现 agent
 * 自己调用 `obelisk --search` / `--query` 会报 `command not found`，尽管 sandbox 级 setup
 * 里 `obeliskInstall()` 的验证步骤（同样通过 `sb.runShell`）能正常找到并跑通
 * `/usr/local/bin/obelisk`。第一次尝试用 `codexAgent({ env: { PATH: … } })` 把镜像默认 PATH
 * 显式传回去（niceeval docs「codex」节:「Agent 进程环境:env 会注入每次 codex exec …
 * 命令子进程都会继承」）——**重跑验证后这个办法没用，agent 子进程还是找不到 `/usr/local/bin`
 * 下的东西**，说明 codex 沙箱化执行命令子进程时不是简单继承/合并父进程 env.PATH,`env` 字段
 * 至少在这层影响不到实际生效的 PATH。真正生效的修法是 `shared/nowledge.ts` 已经踩过的同一个
 * 坑（见其 `nowledgeAttachRemote()` 里"别赌 codex 进程的 PATH 含 ~/.local/bin"那条注释）：
 * 装完之后再软链一份到 `/usr/bin`——这是本镜像里 agent 命令子进程实测一定能解析到的目录
 * （`git`、`sed` 都装在这，`rg` 没装在这却仍能被 agent 用到，大概率是 codex 自带的 vendored
 * 二进制，进一步说明 agent 子进程的 PATH 是 codex 自己拼的一份、不等同于容器默认 PATH，
 * 也不受 `env.PATH` 覆盖）。
 *
 * **已修（2026-08-04，改走派生镜像，非静默 workaround）：** 官方 `niceeval/codex:0.144.1-r3`
 * 由 `node:24-slim` 派生，而所有官方 Node Docker 镜像（含交叉验证过的 `node:20-slim`，与
 * Node 大版本无关）都自带预装 Yarn（`/opt/yarn-v1.22.22/bin/yarn` 软链到
 * `/usr/local/bin/yarn{,pkg}`）。本仓库多道题（至少 `react-tooltip` 六题全灭；代码注释显示
 * `downshift` 也踩过同一类问题）的 eval 安装步骤写的是 `npm install -g --prefix /usr/local
 * yarn@1.22.22 && yarn install ...`，隐含假设环境本无 Yarn——这个假设只在它们原先验证过的
 * codex/claude E2B 官方模板上成立（该模板不预装 Yarn），换到官方 Docker 镜像就 100% 撞
 * `npm error code EEXIST / path /usr/local/bin/yarn`。这与 obelisk 记忆机制本身无关，是
 * niceeval 官方 Docker 镜像与对应 E2B 官方模板工具链基线不一致暴露出的通用环境差异——已作为
 * 上游 DX 问题上报。协调决策：不改 `evals/` 里的安装步骤（会改变这些题的指纹，作废
 * baseline/mempal/nowledge 三个既有实验的全部沿用结果，代价不可接受），也不在这个文件的
 * sandbox setup 里悄悄删 Yarn 符号链接（那是掩盖问题）。改用 `scripts/obelisk-docker/`
 * 派生一份去掉预装 Yarn 的本地镜像，契约干净、影响面只限于本实验自己选用的 provider，
 * 与 mempal 为专属需求（embedding cache）自建 E2B 模板同一思路。构建：`pnpm docker:obelisk`
 * （见 `scripts/build-obelisk-docker-image.sh` 与 `scripts/obelisk-docker/Dockerfile`）。
 * 上游把官方镜像这个不一致修好后，把下面 `OBELISK_DOCKER_IMAGE` 改回引用 niceeval 导出的镜像
 * 常量，删掉 `scripts/obelisk-docker/` 和构建脚本。
 *
 * **已修（2026-08-04，`$HOME` 整个不跨 Attempt 原生持续；只经验定位，未读 niceeval 源码）：**
 * react-tooltip/ 复用同一条 6-Attempt 串行 lane 时发现，第 5 条（pr-1282）agent 自己跑的
 * `obelisk --query` 返回 `overview({ limit: 6 })` 的 `session_total: 1`——只看到它自己这一条
 * 会话，前面 4 条已完成、每条跑了几分钟的 Attempt 一条都不在。经验定位分三步（不读源码，只观察
 * 沙箱运行时状态）：
 *
 * 1. 给 `codexAgent({ preTeardown })` 挂探针，agent 回合结束后跑
 *    `find "$HOME/.codex/sessions"` + `echo HOME=$HOME`，结果用 `ctx.diagnostic(...)` 报告——
 *    **这条通道能在 `niceeval show @<locator>`（不带任何 evidence flag 的裸 overview）里看到**，
 *    显示为 `! agent.teardown · N warnings` 加完整 message 正文。两条连续 Attempt 的探针都显示
 *    `HOME=/root`（同一路径，物理沙箱确实复用），但 `~/.codex/sessions` 下只有当前 Attempt
 *    自己的 rollout 文件——上一条 Attempt 几分钟前写下的那份已经不在了。
 * 2. 用 `codexAgent({ postSetup })` 探针（`ctx.facts` 记会话数）确认：**清空发生在 postSetup
 *    有机会跑之前**——第 2 条 Attempt 的 `postSetup` 一开始就已经看到 `~/.codex/sessions` 是空
 *    的，早于任何可见的 shell 命令。
 * 3. 先按「只有 `.codex/sessions` 被清」的假设接了一版方案——`preTeardown` 把会话复制进
 *    `$HOME/.obelisk-session-archive`（还在 `$HOME` 下，只是 `.codex` 之外），`postSetup`
 *    再搬回来——冒烟直接证伪：下一条 Attempt 的 `postSetup` 探针（先 `find` 归档目录本身再
 *    `cp`）显示 `find: '/root/.obelisk-session-archive': No such file or directory`，**归档
 *    目录本身也没能跨 Attempt 留住**。说明不是「`.codex/sessions` 被单独清了」这么窄，是
 *    **整个 `$HOME` 在 codex adapter 的 per-attempt agent setup 里被重置**——与 niceeval docs
 *    明确写的「$HOME...都活过题间重置」这一通用 sandboxReuse 承诺矛盾，是 codex adapter 自己的
 *    行为，且没有任何可见 shell 命令对应这一步。已作为候选上游 feature request 上报（codex
 *    adapter 对 `$HOME` 的隔离语义与 niceeval 的 sandboxReuse 通用文档不一致，未见任何地方
 *    说明，记忆类实验需要一个显式的、经过文档化的会话/HOME 持久化开关）。
 *
 * **仍未解决(2026-08-04，比「只有 $HOME 重置」更深，archive/restore 接线目前不生效)：**
 * 先按「归档目录挪到 `$HOME` 之外的 `/opt`」接了一版（`/usr/local`、`/usr/bin` ——
 * `obeliskInstall()` 装 CLI 的落点——已反复确认跨 Attempt 存活，`npm install -g` 与符号链接
 * 从未在后续 Attempt 的 `agent.setup` 里重跑，`/opt` 是同一文件系统区域、root 天然可写）。
 * 冒烟直接证伪：pr-1271（lane 里第 2 条）的 `postSetup` fact `obelisk.codex_sessions_at_setup`
 * 仍是 0，`/opt/obelisk-session-archive` 在 pr-1271 的 `postSetup` 里同样查不到 pr-1269
 * 归档过的内容。用最简形式排除 cp/find 复杂度干扰后结论更狠：`preTeardown` 里单纯
 * `date +%s%N >> /opt/obelisk-marker.txt` 写一个标记文件，下一条 Attempt 的 `postSetup`
 * 用 `cat` 读同一路径，两次独立冒烟都报 `No such file or directory`——**agent 级
 * `postSetup`/`preTeardown` 钩子之间，哪怕报告的是同一个 `$HOME=/root`、物理沙箱确实复用，
 * 跨 Attempt 也完全不共享任何写入，不论路径在 `$HOME` 内还是 `$HOME` 外的 `/opt`**。这与
 * niceeval docs「$HOME、/tmp 等 workdir 外状态...会保留」的通用 sandboxReuse 承诺直接矛盾，
 * 且矛盾的范围比最初判断的更大——不是「codex 清空了 `~/.codex/sessions`」这么局部，是
 * agent 级 hook 每条 Attempt 拿到的非 workdir 文件系统视图本身就不共享历史写入（只有
 * Sandbox 级 `.setup()` 建立的基线——即 `obeliskInstall()` 装的 CLI——例外地持续可见）。
 * 这已经超出「不读源码只观察运行时」这条约束能继续往下查的范围：不知道是不是有意为之的
 * per-attempt 隔离设计（比如为了让每条 codex Attempt 的执行环境互不污染，属于正常 eval
 * 场景该有的安全带），只是没在通用 sandboxReuse 文档里点出 codex adapter 这层更强的隔离——
 * 已作为候选上游 feature request 上报（文档缺失：agent 级 postSetup/preTeardown 钩子在
 * codex adapter 下的跨 Attempt 文件系统可见性范围没有说明，与 Sandbox 级 setup/teardown
 * 建立的基线是否共享同一视图也没有说明；记忆类实验需要一个文档化的、明确保证可用的跨
 * Attempt 状态存取点）。`obeliskArchiveSessions()` / `obeliskRestoreSessions()` 两个函数
 * 保留在代码里（逻辑本身没问题，`ctx.facts` 也确认能在裸 `niceeval show @<locator>` 概览的
 * `facts:` 行里看到——这条呈现缺口的纠正是这轮排查唯一确定拿到的正向结果），但**目前不产生
 * 跨 Attempt 记忆效果**，是这个记忆条件当前最大的、未解决的缺口。
 */

/** npm registry 上 `@obelisk-apps/cli` 当前最新版本；建镜像安装步骤与结果 flags 共用这一处。 */
export const OBELISK_VERSION = "0.2.2";

/**
 * 本地派生镜像：`scripts/obelisk-docker/Dockerfile` 从官方 `niceeval/codex:0.144.1-r3`
 * 只删掉预装 Yarn（其余原样继承），`pnpm docker:obelisk` 构建。Tag 把 base 版本原样带过来，
 * base 换版本时这里与构建脚本要同步改，旧 tag 不会被新构建覆盖。只在本机可见，不 push 到
 * 任何 registry——多机/CI 跑这个实验前需要各自先 `pnpm docker:obelisk` 一次。
 *
 * 选官方 `0.144.1-r3` 而不是安装版 niceeval 0.4.6 导出的 `NICEEVAL_CODEX_DOCKER_IMAGE`
 * 常量（指向 `0.144.1-r4`）是因为 2026-08-04 实测 `docker manifest inspect` 该 tag 在
 * Docker Hub 上 404，只有 `0.144.1-r3` 已发布——已作为上游 bug 一并上报。上游发布 r4 后，
 * 派生镜像的 `FROM` 与这里都要跟着换成 r4。
 */
export const OBELISK_DOCKER_IMAGE = "memorybench-codex-noyarn:0.144.1-r3";

/**
 * 教 agent 用 `obelisk --search` / `--query` 检索历史会话的官方 Skill。仓库是
 * tommy0103/obelisk 的 docs-only skill 制品自动发布出来的多 Skill 仓库
 * （`skills/obelisk/SKILL.md`），`ref` 钉死其 `main` 分支当时的 HEAD commit。
 */
export const obeliskSkill: SkillSpec = {
  kind: "repo",
  source: "tommy0103/obelisk-skill",
  ref: "f618952b1e366a2cc7b86525347fafd654091854",
  skills: ["obelisk"],
};

/** 记忆条件的实验事实：换 `obeliskVersion` 就是换了被测条件，历史结果不应混入。 */
export function obeliskFlags(): Record<string, string> {
  return {
    memory: "obelisk",
    obeliskVersion: OBELISK_VERSION,
  };
}

function commandLog(ctx: SandboxHookContext, message: string): void {
  ctx.progress({ message });
}

async function requireCommand(sb: Sandbox, label: string, script: string): Promise<void> {
  const result = await sb.runShell(script);
  if (result.exitCode !== 0) {
    const tail = (result.stderr || result.stdout).trim().slice(-500) || "no output";
    throw new Error(`[obelisk] ${label} failed (exit ${result.exitCode}): ${tail}`);
  }
}

/**
 * codex 的 per-attempt agent setup 会把整个 `$HOME` 重置(经运行时探针实测确认，见文件头
 * 「已修:$HOME 整个不跨 Attempt 原生持续」段——先试过把归档放在 `$HOME` 下的 `.codex` 之外，
 * 冒烟直接证伪：下一条 Attempt 连归档目录本身都找不到)。这不是 sandboxReuse 的通用限制
 * （niceeval docs 明确写「$HOME...都活过题间重置」），是 codex adapter 自己的行为，且没有
 * 任何可见的 shell 命令对应这一步。跨 Attempt 记忆本来就是记忆条件自己的职责（与 mempal 的
 * host 侧 checkpoint 同构），这里把它接住：挪到 `$HOME` 之外的 `/opt`——`/usr/local`
 * 与 `/usr/bin`（`obeliskInstall()` 装 CLI 的落点）已经反复确认跨 Attempt 存活，`/opt` 是
 * 同一文件系统区域、root 天然可写，物理沙箱在世的整个 Invocation 内持续累积——不需要出
 * sandbox，甚至不需要 host 侧文件，纯粹是 `/opt` 与（每次重置的）`$HOME` 两处目录互相同步。
 */
const SESSION_ARCHIVE_DIR = "/opt/obelisk-session-archive";

/**
 * `preTeardown`:agent 回合结束、`$HOME` 被重置之前，把这条 Attempt 写下的 rollout jsonl
 * 复制进归档目录。会话文件名带 session UUID，同名不会冲突，重复复制是幂等的——每条 Attempt
 * 结束时归档目录会包含它自己加上之前所有 Attempt 已归档过的会话。
 */
export function obeliskArchiveSessions(): SandboxCommand {
  return async (sb, ctx) => {
    await sb.runShellOrThrow(
      `mkdir -p "${SESSION_ARCHIVE_DIR}"; [ -d "$HOME/.codex/sessions" ] && cp -R "$HOME/.codex/sessions/." "${SESSION_ARCHIVE_DIR}/" 2>/dev/null; true`,
    );
    const result = await sb.runShellOrThrow(
      `find "${SESSION_ARCHIVE_DIR}" -name "*.jsonl" 2>/dev/null | wc -l | tr -d " "`,
    );
    ctx.facts("obelisk.session_archive_count", Number.parseInt(result.stdout.trim(), 10) || 0);
  };
}

/**
 * `postSetup`:codex 的 agent setup 这时已经重置了 `$HOME`（`~/.codex/sessions` 随之清空），
 * agent 回合开始前把归档找回来——把之前所有 Attempt 累积的会话重新摆回 obelisk 固定索引的
 * 路径，让这条 Attempt 的 agent 能查到自己之前跑过的题。首条 Attempt 归档目录还是空的，`cp`
 * 没内容可复制，正常跳过。
 */
export function obeliskRestoreSessions(): SandboxCommand {
  return async (sb, ctx) => {
    await sb.runShellOrThrow(
      `mkdir -p "$HOME/.codex/sessions" "${SESSION_ARCHIVE_DIR}"; cp -R "${SESSION_ARCHIVE_DIR}/." "$HOME/.codex/sessions/" 2>/dev/null; true`,
    );
    const result = await sb.runShellOrThrow(
      'find "$HOME/.codex/sessions" -name "*.jsonl" 2>/dev/null | wc -l | tr -d " "',
    );
    ctx.facts("obelisk.codex_sessions_at_setup", Number.parseInt(result.stdout.trim(), 10) || 0);
  };
}

/**
 * Sandbox 级 `.setup()`：每台物理沙箱只跑一次，全局装 CLI（root 落 `/usr/local`，天然在 PATH
 * 上）。声明式写法：已装且版本吻合就跳过，不吻合（含从未装过）就重装，重放多少次都收敛到同一
 * 结果，符合复用对幂等的要求。不在这里代 agent 建索引或跑 `obelisk --build`——首次索引和后续
 * 查询都是被测 Skill 该教会 agent 自己做的事，属于记忆条件本身，不是环境准备。
 *
 * 额外软链一份到 `/usr/bin`：codex 的 agent 命令子进程 PATH 不含 `/usr/local/bin`（文件头
 * 「已修:agent 命令子进程 PATH 缺口」有完整调查记录，`env.PATH` 覆盖对这层不生效），只有
 * `/usr/bin`（`git`、`sed` 所在目录）实测 agent 子进程一定能解析到。
 */
export function obeliskInstall(): SandboxHook {
  return async (sb, ctx) => {
    await requireCommand(
      sb,
      "obelisk-cli install",
      `if command -v obelisk >/dev/null 2>&1 && [ "$(obelisk --version 2>/dev/null)" = "${OBELISK_VERSION}" ]; then exit 0; fi; npm install -g @obelisk-apps/cli@${OBELISK_VERSION}`,
    );
    await requireCommand(sb, "obelisk on PATH", `obelisk --version 2>/dev/null | grep -Fx "${OBELISK_VERSION}"`);
    await requireCommand(sb, "obelisk symlink for agent PATH", `ln -sf "$(command -v obelisk)" /usr/bin/obelisk`);
    await requireCommand(sb, "obelisk on agent PATH", `/usr/bin/obelisk --version 2>/dev/null | grep -Fx "${OBELISK_VERSION}"`);
    commandLog(ctx, `[obelisk] obelisk-cli ${OBELISK_VERSION} ready`);
  };
}
