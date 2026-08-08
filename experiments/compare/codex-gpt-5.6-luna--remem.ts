import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { dockerImageSandbox } from "niceeval/sandbox";
import { REMEM_DOCKER_IMAGE, rememCodexConfig, rememFlags, rememPrepare } from "../shared/remem.ts";

// codex-gpt-5.6-luna 的 remem 变体:同模型,只多一层 remem 记忆条件——官方 codex 集成
// (SessionStart/Stop hook 读写 + `remem mcp` server),二进制烘进本地派生镜像
// experiments/shared/docker/codex-remem.Dockerfile(为什么要派生、embedding 降级到
// feature-hash 不影响捕获/蒸馏路径,完整背景见 experiments/shared/remem.ts 文件头)。
// 对照 codex-gpt-5.6-luna.ts 看 pass 率与效率(时间/token/重复失败命令)的差异。
//
// 记忆态语义:remem 状态是纯本地 `$HOME/.remem/`,只在本次 run 的物理沙箱内积累,不做
// 跨 run 的 checkpoint 回存(与 mempal/nowledge 都不同,见 shared/remem.ts)。要看"从空库
// 开始"的干净对照,直接开一次新 run 即可,不需要像 mempal 那样手动清理 host 侧状态目录。
//
// **重要 caveat(2026-08-04 实测,详见 shared/remem.ts「拓扑与记忆态语义」一节)**:上面这
// 段"跨 Attempt 积累"是设计意图,不是已验证行为。实测 toggl-cli 链式题显示,dockerImageSandbox
// + sandboxReuse 下 Agent 级 postSetup 对 `$HOME` 的写入不会存活到下一条 Attempt——接线
// (hooks/MCP)本身没问题,但记忆内容没有真正跨题积累,当前这批结果应读作"remem 装对了但
// 退化成 no-memory baseline",不是 remem 记忆条件的真实效果对照。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · remem",
  labels: { line: "codex" }, // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: codexAgent(rememCodexConfig()),
  flags: { ...rememFlags() },
  model: "gpt-5.6-luna",
  // dockerImageSandbox({ image }) 不声明 lifetimeMs 也能构造,但复用机制的这条校验只在真实
  // 创建沙箱时跑,--dry 不会报——2026-08-04 冒烟实测过(react-tooltip/ 6 条全部
  // errored: "the docker sandbox needs lifetimeMs when sandboxReuse is enabled")。
  // 本地 Docker 容器没有 e2b 那种账号级硬寿命上限,这个值纯粹满足复用机制的通用要求,
  // 不代表容器真的会在 1 小时被回收;与 mempal/nowledge 两个 e2b 记忆条件写同一个数字
  // 只是巧合对齐,不是同一层含义。
  sandbox: dockerImageSandbox({ image: REMEM_DOCKER_IMAGE, lifetimeMs: 60 * 60_000 }).prepare(
    rememPrepare(),
  ),
  // 复用:remem 二进制已烘进镜像,sandbox 级只有 rememPrepare 这层薄探测,省的是 codex CLI
  // 安装 + 公共依赖每题重付一次。postSetup 的 `remem install --target codex` 在残留 $HOME
  // 上幂等重放(2026-08-04 手工验证过两遍:key/db 显示 existing、mcp_servers.remem 不重复写)。
  earlyExit: false,
  // Group 内按声明顺序积累本地状态；不同仓库家族使用独立 Sandbox 并行推进。
  maxConcurrency: 4,
  // 与 codex baseline/mempal/nowledge 对齐;toggl-cli 链式题需要 30 分钟的 agent deadline,
  // 实验上限保持一致不截断它的单题超时。
  timeoutMs: 1_800_000,
});
