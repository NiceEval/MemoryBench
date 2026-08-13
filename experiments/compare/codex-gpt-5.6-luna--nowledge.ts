import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { dockerSandbox, NICEEVAL_CODEX_DOCKER_IMAGE } from "niceeval/sandbox";
import {
  nowledgeAttachRemote,
  nowledgeCodexConfig,
  nowledgeFlags,
} from "../shared/nowledge.ts";

// codex-gpt-5.6-luna 的 Nowledge Mem 变体:同模型同沙箱,只多一层 Nowledge Mem 记忆条件 ——
// 官方 codex 集成(远程 HTTP MCP 读路径 + 插件 lifecycle hooks 写路径 + nmem CLI),
// 全链路已在 2026-07-30 的 dogfood 接线冒烟里闭环确认(Stop hook 落 thread、
// agent 主动 nmem m search/add)。
// 对照 codex-gpt-5.6-luna.ts 看 pass 率与效率(时间/token/重复失败命令)的差异。
//
// mem 服务端是长期运行的固定远程实例(连接坐标在 .env,见 shared/nowledge.ts 文件头):
// niceeval 侧不管服务端生命周期,沙箱生命周期 Hook 负责接线与收尾核对。每个 Eval Group
// 使用同名 Nowledge Space；Group 内记忆沿实际执行历史持续积累，Group 间隔离并行。
// 当前 Eval Group 不承诺业务顺序，不能把定义数组位置当成记忆前缀。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · Nowledge Mem",
  labels: { line: "codex" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: codexAgent(nowledgeCodexConfig()),
  flags: nowledgeFlags(),
  model: "gpt-5.6-luna",
  // Eval Group 管理 Docker 复用；lifetimeMs 为物理容器声明长 Attempt 的寿命预算，不是云配额。
  sandbox: dockerSandbox({ source: { type: "image", image: NICEEVAL_CODEX_DOCKER_IMAGE }, lifetimeMs: 60 * 60_000 })
    .prepare(nowledgeAttachRemote()),
  // agent config 的 preTeardown 每条 Attempt 核对 prepare 时连接的隧道。
  // 复用 + 串行,与 mempal 组逐字对齐。插件安装不是阻碍:niceeval 的 codex adapter 在每条 attempt
  // 开始前把同名 marketplace 注册与插件安装先摘后装、收敛到声明(niceeval docs/feature/adapters/
  // architecture/coding-agent-extensions.md「安装收敛」),install_hooks.py 改写托管源的残留也被
  // 吸收(2026-07-30 用 dogfood × attempts:3 验过:第 2、3 条 attempt 踩残留 $HOME 仍全过)。
  earlyExit: false,
  // Group 内共享一条 lane，不同 Group 由中心化服务并发处理。
  maxConcurrency: 6,
  // 与 codex baseline/mempal 对齐,astropy eval 两阶段都要源码构建。
  // toggl-cli chain evals explicitly need a 30-minute agent deadline; keep the
  // experiment ceiling aligned so it does not truncate their per-eval timeout.
  timeoutMs: 1_800_000,
});
