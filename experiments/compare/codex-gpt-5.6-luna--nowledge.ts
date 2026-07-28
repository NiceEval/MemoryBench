import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { e2bSandbox } from "niceeval/sandbox";
import { NICEEVAL_CODEX_E2B_TEMPLATE } from "niceeval/sandbox/e2b-template";
import {
  nowledgeCodexConfig,
  nowledgeFlags,
  NOWLEDGE_PROVENANCE_FLAGS,
  nowledgeAttachRemote,
  nowledgeVerifyRemoteAlive,
} from "../shared/nowledge.ts";

// codex-gpt-5.6-luna 的 Nowledge Mem 变体:同模型同沙箱,只多一层 Nowledge Mem 记忆条件 ——
// 官方 codex 集成(远程 HTTP MCP 读路径 + 插件 lifecycle hooks 写路径 + nmem CLI),
// 全链路已在 dev-e2b/codex-gpt-5.4-mini-nowledge 冒烟闭环确认(Stop hook 落 thread、
// agent 主动 nmem m search/add),此前只差把它搬进 compare 组用真实对比模型 gpt-5.6-luna 跑。
// 对照 codex-gpt-5.6-luna.ts 看 pass 率与效率(时间/token/重复失败命令)的差异。
//
// mem 服务端是长期运行的固定远程实例(连接坐标在 .env,见 shared/nowledge.ts 文件头):
// niceeval 侧不管服务端生命周期,沙箱钩子负责接线与收尾核对,记忆跨 run / 跨实验持续积累,
// 与 mempal「状态跨 run 存续」对齐。同批的 claude-dp-v4--nowledge 共用同一个库;正式对比要说清起点库状态。
// 隔离:中心化 server 自理并发读写,并行 attempt 不会踩坏彼此的写入,故这里不压成串行(见
// shared/nowledge.ts 文件头「可并发」)。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · Nowledge Mem",
  labels: { line: "codex" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: codexAgent(nowledgeCodexConfig()),
  flags: { ...nowledgeFlags() },
  model: "gpt-5.6-luna",
  sandbox: e2bSandbox({ template: NICEEVAL_CODEX_E2B_TEMPLATE })
    .setup(nowledgeAttachRemote())
    // 收尾核对 setup 时连的那个隧道还活着;中途换址会让 memory_add 静默全挂,见 shared/nowledge.ts
    .teardown(nowledgeVerifyRemoteAlive()),
  earlyExit: false,
  // 并发:中心化 server 自理并发读写,记忆库不像 mempal 的 checkpoint 文件那样怕并行踩踏,
  // 所以这里不压到 1(见 shared/nowledge.ts 文件头「可并发」)。
  maxConcurrency: 4,
  // 与 codex baseline/mempal 对齐,astropy eval 两阶段都要源码构建。
  timeoutMs: 1200000,
});
