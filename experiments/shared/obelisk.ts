import type { SkillSpec } from "niceeval/adapter";
import {
  codexAgentExtension,
  definePlugin,
  type PluginInstance,
} from "niceeval/plugin";
import { NICEEVAL_CODEX_DOCKER_IMAGE } from "niceeval/sandbox";
import type { Sandbox, SandboxCommand, SandboxHook, SandboxHookContext } from "niceeval/sandbox";

/**
 * Obelisk 记忆条件:官方 Node CLI(`@obelisk-apps/cli`)把 `~/.codex/sessions`(以及
 * `~/.claude/`)的会话 transcript 索引进本地 `~/.obelisk/obelisk.sqlite`(SQLite + FTS5),
 * 配套的 Claude/Codex 通用 Skill 教 agent 写小段 JS 查询脚本、经 `obelisk --query <file>`
 * 或 `obelisk --search "text"` 检索自己的历史会话。
 *
 * 记忆语义(v1):状态本应就是 `$HOME` 下的 `~/.codex/sessions` + `~/.obelisk`，2026-08-04
 * 冒烟时一度实测「codex adapter 的 per-attempt agent setup 会把整个 `$HOME` 重置」，据此把
 * 实际状态落到了 `obeliskArchiveSessions()` / `obeliskRestoreSessions()` 维护的
 * `/opt/obelisk-session-archive`——这个目录特意选在 `$HOME` 之外。**这个前提本身已被同一天
 * 晚些时候的排查推翻,见文件头「已修:执行身份根因修正」段:`$HOME` 从未被"重置",是每条
 * Attempt 压根没有分到同一个物理容器,`$HOME` 自然每次都是全新的。** 保留 `/opt` 归档这层
 * 设计不是因为它绕开了一个真实的 `$HOME` 重置行为,而是因为 Eval Group 的 Docker 复用一旦真正生效
 * (本仓库已修复,见下),`$HOME` 就会跨 Attempt 天然存活,`/opt` 归档反而是不必要的额外
 * 复杂度——**但目前仍保留这套 `/opt` 机制**,因为 `preTeardown`/`postSetup` 对 `$HOME` 的
 * 读写时序仍需要一次真实的多 Attempt 复用批次验证,归档层作为不依赖这次验证结论的后备路径,
 * 拆除留到那次验证之后。`preTeardown` 把每条 Attempt 写下的会话搬进 `/opt` 下这个 codex 不会
 * 碰的目录，下一条 Attempt 的 `postSetup` 再搬回新 `~/.codex/sessions`。本条件**不做跨 run
 * 回存**——每次全新 Invocation 从零开始，归档目录本身也在物理沙箱销毁时一并消失，没有
 * mempal 那种 host 侧 checkpoint tgz，也没有 nowledge 那种远程库；Eval Group 的 Docker
 * lane 只保证组内串行共享物理 Sandbox。当前没有业务顺序 API，归档只能代表实际发生过的
 * Attempt 历史，不能把 `evals` 数组位置当成声明顺序。
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
 * 里当时的安装步骤（现已改名 `obeliskProbe()`，同样通过 `sb.runShell`）能正常找到并跑通
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
 * 迁移前的云端 Agent 基底不预装 Yarn，换到官方 Docker 镜像就 100% 撞
 * `npm error code EEXIST / path /usr/local/bin/yarn`。这与 obelisk 记忆机制本身无关，是
 * NiceEval 官方 Docker 镜像与迁移前云端基底工具链不一致暴露出的通用环境差异——已作为
 * 上游 DX 问题上报。协调决策：不改 `evals/` 里的安装步骤（会改变这些题的指纹，作废
 * baseline/mempal/nowledge 三个既有实验的全部沿用结果，代价不可接受），也不在这个文件的
 * sandbox setup 里悄悄删 Yarn 符号链接（那是掩盖问题）。改用 `scripts/obelisk-docker/`
 * 派生一份去掉预装 Yarn 的本地镜像，契约干净、影响面只限于本实验自己选用的 provider，
 * 与 Mempal 为专属需求预制 Docker 镜像同一思路。构建：`pnpm docker:obelisk`
 * （见 `scripts/build-obelisk-docker-image.sh` 与 `scripts/obelisk-docker/Dockerfile`）。
 * 上游把官方镜像这个不一致修好后，把下面 `OBELISK_DOCKER_IMAGE` 改回引用 niceeval 导出的镜像
 * 常量，删掉 `scripts/obelisk-docker/` 和构建脚本。
 *
 * **已修（2026-08-04，执行身份根因修正——上面两段「$HOME 重置」「archive/restore 不生效」
 * 的因果解释均已被推翻，原始经验记录保留，结论重写）：** react-tooltip/ 复用同一条
 * 6-Attempt 串行 lane 时最初发现，第 5 条（pr-1282）agent 自己跑的 `obelisk --query` 返回
 * `overview({ limit: 6 })` 的 `session_total: 1`——只看到它自己这一条会话，前面 4 条已完成、
 * 每条跑了几分钟的 Attempt 一条都不在。经验定位分几步（不读源码，只观察沙箱运行时状态）：
 *
 * 1. 给 `codexAgent({ preTeardown })` 挂探针，agent 回合结束后跑
 *    `find "$HOME/.codex/sessions"` + `echo HOME=$HOME`，结果用 `ctx.diagnostic(...)` 报告——
 *    两条连续 Attempt 的探针都显示 `HOME=/root`（同一路径），但 `~/.codex/sessions` 下只有
 *    当前 Attempt 自己的 rollout 文件——上一条 Attempt 几分钟前写下的那份已经不在了。
 * 2. 用 `codexAgent({ postSetup })` 探针（`ctx.facts` 记会话数）确认：第 2 条 Attempt 的
 *    `postSetup` 一开始就已经看到 `~/.codex/sessions` 是空的，早于任何可见的 shell 命令。
 * 3. 按「归档目录挪到 `$HOME` 之外的 `/opt`」接了一版方案冒烟，同样落空：`preTeardown` 里
 *    单纯 `date +%s%N >> /opt/obelisk-marker.txt` 写一个标记文件，下一条 Attempt 的
 *    `postSetup` 用 `cat` 读同一路径，报 `No such file or directory`——`/opt` 与 `$HOME`
 *    表现完全一致。
 *
 * 当时（步骤 1-3 发生时）把这一组现象解释成「agent 级 `postSetup`/`preTeardown` 钩子之间，
 * 哪怕报告的是同一个 `$HOME=/root`，跨 Attempt 也完全不共享任何文件系统写入」，并作为候选
 * 上游 feature request 上报（怀疑是 codex adapter 自己更强的 per-attempt 隔离，且没有文档
 * 说明）。**这个解释是错的，已被同一天晚些时候的排查推翻。** 真正的根因浅得多、也好修得多：
 * 这份派生镜像当时没有声明 `USER`，`docker run` 默认以 root 执行；niceeval 的 Docker Sandbox
 * 文档化契约是「非 root 是预制环境自己的义务，不是 runner 的强加」（niceeval docs「Docker：
 * 从官方基线继续构建」）——Docker provider 的复用安全检查在检测到 root 身份时拒绝复用，静默把
 * 物理沙箱退休、给下一条 Attempt 新建一个全新容器。步骤 1-3 观测到的每一个现象都能被这一个
 * 原因完整解释：`$HOME=/root` 在两条 Attempt 里"看起来一样"只是因为两个全新容器都用同一个
 * 默认 `$HOME` 路径，不是同一个容器；`~/.codex/sessions`、`/opt` 下的任何写入"消失"，是因为
 * 下一条 Attempt 压根不是同一台物理机器，不是"钩子间不共享写入"这个更深、更奇怪的机制。
 * 用同一派生镜像做过反事实验证：补上 `USER node` 后，以 uid 1000 身份跑，Docker 的
 * 复用检查通过，标记文件确实跨题间 reset 存活。
 *
 * 修法（`scripts/obelisk-docker/Dockerfile`）：`npm install -g @obelisk-apps/cli` 从运行时
 * `.setup()` 挪进构建期（root 执行，见 `obeliskProbe()` 的文档），末尾声明 `USER node`；
 * `obeliskArchiveSessions()`/`obeliskRestoreSessions()` 用到的 `/opt/obelisk-session-archive`
 * 额外在构建期 `chown` 给 `node`——这两个函数的 shell 命令都以 `; true` 收尾，目录不可写时
 * `mkdir -p`/`cp` 会静默失败而不报错，之前一直没暴露是因为反正整个复用机制都没生效，这层
 * 权限问题被更大的问题掩盖了。
 *
 * `obeliskArchiveSessions()`/`obeliskRestoreSessions()` 两个函数本身逻辑没有变，`ctx.facts`
 * 也确认能在裸 `niceeval show @<locator>` 概览的 `facts:` 行里看到（这条呈现缺口的纠正是
 * 最初那轮排查唯一确定拿到的正向结果，仍然成立）。**这份修复目前只验证到"容器身份非 root +
 * Docker 复用检查通过 + 标记文件跨题间 reset 存活"这一层（零成本，不需要真实模型调用）；
 * 完整的多 Attempt archive/restore 流程——即这套机制真的能让后一条 Attempt 的 agent 查到
 * 前面几条 Attempt 的会话——还没有用一次真实的 codex exec 批次验证过，需要用户批准全量重跑
 * 成本后再采集（2026-08-04 协调决策，见 AGENTS.md「成本纪律」）。** 在那次验证之前，这套
 * 机制"预期能用"，不是"已证实能用"。
 */

/** npm registry 上 `@obelisk-apps/cli` 当前最新版本；建镜像安装步骤与结果 flags 共用这一处。 */
export const OBELISK_VERSION = "0.2.2";

/**
 * 本地派生镜像：`scripts/obelisk-docker/Dockerfile` 从官方 `niceeval/codex:0.144.1-r4`
 * 删掉预装 Yarn、把 obelisk CLI 烘进镜像、恢复基底声明的 `USER node`，`pnpm docker:obelisk`
 * 构建。为什么要非 root、为什么要把 CLI 安装从运行时挪进构建期，完整背景见 Dockerfile 文件头
 * 注释与下面「已修：agent 级钩子跨 Attempt 状态不存活」一节——核心结论是：这不是
 * niceeval 的 bug，是本仓库派生镜像此前没有声明执行身份，导致 Docker provider 的复用安全
 * 检查拒绝复用、静默把物理沙箱退休、给下一条 Attempt 新建一个全新容器。
 *
 * 最初选官方 `0.144.1-r3` 而不是安装版 niceeval 0.4.6 导出的 `NICEEVAL_CODEX_DOCKER_IMAGE`
 * 常量（当时已指向 `0.144.1-r4`）是因为 2026-08-04 实测 `docker manifest inspect` 该 tag 在
 * Docker Hub 上 404，只有 `0.144.1-r3` 已发布——已作为上游 bug 一并上报。**上游已发布 r4**
 * （NiceEval commit cbac5659，收尾声明 `USER node`，本仓库 2026-08-04 迁移）：派生镜像的
 * `FROM` 与这里的 tag 前缀都已换成 r4；派生层不再自己发明非 root，删 Yarn/装 CLI 这些安装
 * 步骤改为显式 `USER root` 做完再显式 `USER node` 恢复基底身份，见 Dockerfile。
 */
// r5 = 补 python3（2026-08-05；官方 codex Docker 镜像缺、toggl-cli probe 需要）。
// r6 = 基底从 NiceEval 公开 Codex Docker 镜像常量读取，避免本仓库复制 Agent 镜像 tag。
const OBELISK_DOCKERFILE_REVISION = "r6";
const OBELISK_BASE_IMAGE = NICEEVAL_CODEX_DOCKER_IMAGE;
const OBELISK_BASE_TAG = OBELISK_BASE_IMAGE.slice(OBELISK_BASE_IMAGE.lastIndexOf(":") + 1);

/**
 * 派生镜像 tag——base 镜像版本、obelisk 版本、Dockerfile 配方版本都编进去，任一个变了 tag
 * 自然不同（与 remem.ts 的 `REMEM_DOCKER_IMAGE` 同一命名方案）。2026-08-04 从
 * `memorybench-codex-noyarn:0.144.1-r3` 改名为 `memorybench-codex-obelisk`：配方已经从
 * 「只删 Yarn」变成「删 Yarn + 装 obelisk CLI + 非 root」，旧名字不再准确，也不该被新构建
 * 静默覆盖。同日晚些时候基底从 r3 迁到 r4（见上方常量注释），tag 前缀同步更新。
 */
export const OBELISK_DOCKER_IMAGE = `memorybench-codex-obelisk:${OBELISK_BASE_TAG}-${OBELISK_VERSION}-${OBELISK_DOCKERFILE_REVISION}`;

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
 * 归档目录挪到 `$HOME` 之外的 `/opt`：跨 Attempt 记忆本来就是记忆条件自己的职责（与 mempal
 * 的 host 侧 checkpoint 同构）。选 `/opt` 而不是 `$HOME` 下的子目录不是因为 `/opt` 有什么
 * 特殊豁免——两者现在都会跨题间 reset 存活（见文件头「已修：执行身份根因修正」段，`/opt` 与
 * `$HOME` 之前"看起来都不存活"是同一个根因：容器压根没有被复用）——纯粹是保持路径固定、
 * 不与 codex 自己管理的 `~/.codex/sessions` 目录混在一起，也不用担心 codex 未来的版本清理
 * 或改写 `$HOME` 下这个子路径。`/usr/local`、`/usr/bin`（`obeliskProbe()` 探测的落点，CLI
 * 本身已烘进镜像）在同一台物理沙箱内同样持续可见，`/opt/obelisk-session-archive` 额外在
 * 镜像构建期 `chown` 给了 `node`（见 `scripts/obelisk-docker/Dockerfile`），运行时以 node
 * 身份写入不受权限阻挡。
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
 * Sandbox 级 `.setup()`：每台物理沙箱只跑一次，薄探测——只验证派生镜像里已经烘好的 obelisk
 * 二进制版本对不对，不在这里装任何东西。与 remem 侧 `rememPrepare()` 同一个思路（remem 验证
 * Docker 镜像里烘好的二进制，这里验证同一件事）。
 *
 * **2026-08-04 由「装」改成「探」**：此前这里用 `npm install -g` 在运行时把 CLI 装进
 * `/usr/local`，是因为当时镜像没有声明非 root 执行身份，`npm install -g` 可以直接以 root
 * 写系统目录。补上 `USER node`（见 `scripts/obelisk-docker/Dockerfile`）后，容器默认执行
 * 身份变成 node，而 `/usr/local/lib/node_modules`、`/usr/local/bin`、`/usr/bin` 都只有
 * root 可写——运行时再跑 `npm install -g` 会直接 permission denied。修法是把安装本身挪进
 * Dockerfile 构建期（那时还是 root），这里的 `.setup()` 退化成纯探测，与 remem 记忆条件的
 * 架构完全对齐。
 *
 * 不在这里代 agent 建索引或跑 `obelisk --build`——首次索引和后续查询都是被测 Skill 该教会
 * agent 自己做的事，属于记忆条件本身，不是环境准备。
 */
export function obeliskProbe(): SandboxHook {
  return async (sb, ctx) => {
    const probe = await sb.runShell("command -v obelisk");
    if (probe.exitCode !== 0) {
      throw new Error(
        `[obelisk] image does not contain obelisk. Build ${OBELISK_DOCKER_IMAGE} with ` +
          "`bash scripts/build-obelisk-docker-image.sh`, then use that image.",
      );
    }
    await requireCommand(sb, "obelisk on PATH", `obelisk --version 2>/dev/null | grep -Fx "${OBELISK_VERSION}"`);
    await requireCommand(
      sb,
      "obelisk on agent PATH",
      `/usr/bin/obelisk --version 2>/dev/null | grep -Fx "${OBELISK_VERSION}"`,
    );
    commandLog(ctx, `[obelisk] image probe passed: obelisk-cli ${OBELISK_VERSION}`);
  };
}

const obeliskCondition = definePlugin<Record<never, never>>({
  name: "memorybench.obelisk",
  behaviorRevision: "1",
  instanceKey: () => OBELISK_VERSION,
  experiment: () => ({
    identity: {
      memory: "obelisk",
      obeliskVersion: OBELISK_VERSION,
    },
    flags: obeliskFlags(),
    agentExtensions: [codexAgentExtension({
      skills: [obeliskSkill],
      postSetup: [obeliskRestoreSessions()],
      preTeardown: [obeliskArchiveSessions()],
    })],
  }),
});

/** Complete Obelisk condition; the physical image probe remains on the author Sandbox. */
export function obeliskPlugin(): PluginInstance<"experiment"> {
  return obeliskCondition({});
}
