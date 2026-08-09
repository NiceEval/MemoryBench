import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { dockerImageSandbox } from "niceeval/sandbox";
import { REMEM_DOCKER_IMAGE, rememCodexConfig, rememFlags, rememPrepare } from "../shared/remem.ts";

const MODEL = "gpt-5.6-luna";
// Remem 没有跨物理容器 checkpoint。最大 Group 有 8 个 member，每条最多 30 分钟；
// Docker TTL 又不能续期，所以要覆盖整条 lane，而不只是单条 Attempt。
const STATEFUL_GROUP_LIFETIME_MS = 5 * 60 * 60_000;

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
// 2026-08-09 已用 Docker events 和跨题 captured_events 双重验证 Group 容器复用与
// `$HOME` 持久化。Remem 后台 Codex 的 provider 隔离、显式 memory model 与 extraction
// drain 契约由 shared/remem.ts 统一实现；管线未实际产生 memory-AI call 时实验会明确报错。
// 单独六段链通过 5/6：03、04 首次通过，06 因最低计费规则被错误概括而失败；两路全量
// 随后又暴露 60 分钟 TTL 会在后段正常换容器，故下方寿命现按整条 stateful Group 预算。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · remem",
  labels: { line: "codex" }, // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: codexAgent(rememCodexConfig(MODEL)),
  flags: { ...rememFlags(MODEL) },
  model: MODEL,
  // 每次借出前，NiceEval 要求剩余 TTL 足以覆盖本条 Attempt 的 30 分钟上限和 cleanup；
  // Docker TTL 不可续期。1 小时配置在两路全量跑的 05→06 之间触发了正常轮换，导致
  // raw_messages 从 63 回到 14。5 小时覆盖 8 × 30 分钟的最长 Group 和收尾余量。
  sandbox: dockerImageSandbox({ image: REMEM_DOCKER_IMAGE, lifetimeMs: STATEFUL_GROUP_LIFETIME_MS }).prepare(
    rememPrepare(),
  ),
  sandboxReuse: true,
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
