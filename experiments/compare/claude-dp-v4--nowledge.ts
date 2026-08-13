import { defineExperiment } from "niceeval";
import { claudeCodeAgent } from "niceeval/adapter";
import { dockerSandbox, NICEEVAL_CLAUDE_CODE_DOCKER_IMAGE } from "niceeval/sandbox";
import {
  nowledgeAttachRemote,
  nowledgeClaudeConfig,
  nowledgeFlags,
} from "../shared/nowledge.ts";

// claude-dp-v4 的 Nowledge Mem 变体:同模型同沙箱,只多一层 Nowledge Mem 记忆条件 ——
// 官方 claude-code 插件(装上即挂 SessionStart 读 / UserPromptSubmit 指引 / Stop 写 的 lifecycle
// hooks,无 install 脚本、无 hook-trust、插件根无 .mcp.json 故不叠远程 MCP,读写都走 nmem CLI)。
// 对照 claude-dp-v4.ts 看 pass 率与效率(时间/token/重复失败命令)的差异。claude-code 侧的接线
// 已冒烟跑通(probe 实锤 Stop hook 落 thread 到服务端)。
//
// mem 服务端是长期运行的固定远程实例(连接坐标在 .env,见 shared/nowledge.ts 文件头):
// niceeval 侧不管理服务端生命周期，Sandbox prepare 只做接线。每个 Eval Group 使用同名
// Nowledge Space；同一 Group 的状态跨 run / 跨实验持续积累，与 mempal 的持久状态语义对齐。
// 同批 Codex / Claude 变体按 Group 共用 Space，正式对比要说清起点状态。license 在服务端侧
// 一次性激活(device 固定,seat 稳定占一个,不再随 run 增长);
// free tier memory 上限 50,持久积累库容易撞上限,正式跑前确认服务端是 pro。
// Eval Group 只保证组内共享一条串行 lane、Group 间可并行；当前尚无业务顺序契约，
// 不能把 `evals` 数组位置解释成 N 必然读取 N-1。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "claude-code · deepseek-v4-flash · Nowledge Mem",
  labels: { line: "claude" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: claudeCodeAgent({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    ...nowledgeClaudeConfig(),
  }),
  flags: nowledgeFlags(),
  model: "deepseek-v4-flash",
  sandbox: dockerSandbox({ source: { type: "image", image: NICEEVAL_CLAUDE_CODE_DOCKER_IMAGE }, lifetimeMs: 60 * 60_000 })
    .prepare(nowledgeAttachRemote()),
  // agent config 的 preTeardown 每条 Attempt 核对 prepare 时连接的隧道。
  attempts: 1,
  earlyExit: true,
  // Group 内共享一条 lane；不同 Group 由中心化服务并发处理。
  maxConcurrency: 6,
  timeoutMs: 1200000,
});
