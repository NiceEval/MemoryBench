import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { e2bSandbox } from "niceeval/sandbox";
import { NICEEVAL_CODEX_E2B_TEMPLATE } from "niceeval/sandbox/e2b-template";
import {
  nowledgeCodexConfig,
  nowledgeFlags,
  nowledgeAttachRemote,
} from "../shared/nowledge.ts";

// codex-gpt-5.6-luna 的 Nowledge Mem 变体:同模型同沙箱,只多一层 Nowledge Mem 记忆条件 ——
// 官方 codex 集成(远程 HTTP MCP 读路径 + 插件 lifecycle hooks 写路径 + nmem CLI),
// 全链路已在 2026-07-30 的 dogfood 接线冒烟里闭环确认(Stop hook 落 thread、
// agent 主动 nmem m search/add)。
// 对照 codex-gpt-5.6-luna.ts 看 pass 率与效率(时间/token/重复失败命令)的差异。
//
// mem 服务端是长期运行的固定远程实例(连接坐标在 .env,见 shared/nowledge.ts 文件头):
// niceeval 侧不管服务端生命周期,沙箱钩子负责接线与收尾核对，并始终使用服务端 default Space。
// 本实验内记忆按串行顺序持续积累。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · Nowledge Mem",
  labels: { line: "codex" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: codexAgent(nowledgeCodexConfig()),
  flags: { ...nowledgeFlags() },
  model: "gpt-5.6-luna",
  // 复用下 provider 必须能声明实例寿命,不声明会在第一条 attempt 派发前硬失败。1 小时是 e2b
  // 账号档位硬上限,但它不是整次 run 的总预算:每次派发前 runner 都会 ensureLifetime 续到完整 lifetimeMs,
  // 所以同一物理 Sandbox 可以持续复用,只要单条 Attempt 装得下 1 小时(详见 codex-gpt-5.6-luna--mempal.ts)。
  sandbox: e2bSandbox({ template: NICEEVAL_CODEX_E2B_TEMPLATE, lifetimeMs: 60 * 60_000 })
    .prepare(nowledgeAttachRemote()),
  // agent config 的 preTeardown 每条 Attempt 核对 prepare 时连接的隧道。
  // 复用 + 串行,与 mempal 组逐字对齐。插件安装不是阻碍:niceeval 的 codex adapter 在每条 attempt
  // 开始前把同名 marketplace 注册与插件安装先摘后装、收敛到声明(niceeval docs/feature/adapters/
  // architecture/coding-agent-extensions.md「安装收敛」),install_hooks.py 改写托管源的残留也被
  // 吸收(2026-07-30 用 dogfood × attempts:3 验过:第 2、3 条 attempt 踩残留 $HOME 仍全过)。
  sandboxReuse: true,
  earlyExit: false,
  // maxConcurrency: 1 让 Attempt 串行。这里不是怕并行踩坏写入(中心化 server 自理并发读写,见 shared/nowledge.ts
  // 文件头「可并发」),而是为了**跨记忆条件可比**:mempal 因为 checkpoint 文件必须串行,
  // nowledge 若留在 4 路,跨 eval 的记忆可见顺序就是不确定的(eval N 不保证读得到 N-1 刚写的),
  // 两个记忆条件配得不一样,pass rate 差异就分不清是记忆实现的差异还是积累顺序的差异。
  //
  // 代价与 mempal 同款:① 当前 prepare 是 opaque command callback,所以 carry 被禁用、中断后计划内题目
  // 全量重跑(36 题串行 ≈ 3h)；这不是 sandboxReuse 本身的规则。远端库可能已有中断 Attempt 的
  // 半次写入,正式比较要换新 NOWLEDGE_COHORT 从头重建。② 换来的是沙箱创建 + 公共准备从每题
  // 一次降到每台物理 Sandbox 一次,以及 toggl-cli 那条 rust 工具链 / cargo 缓存跨题存活
  // (实测省约 1 分钟/题)。
  maxConcurrency: 1,
  // 与 codex baseline/mempal 对齐,astropy eval 两阶段都要源码构建。
  // toggl-cli chain evals explicitly need a 30-minute agent deadline; keep the
  // experiment ceiling aligned so it does not truncate their per-eval timeout.
  timeoutMs: 1_800_000,
});
