import { defineExperiment } from "niceeval";
import { claudeCodeAgent } from "niceeval/adapter";
import { dockerImageSandbox, NICEEVAL_CLAUDE_CODE_DOCKER_IMAGE } from "niceeval/sandbox";

// Claude Code Docker 组：CLI 接 deepseek 代理(ANTHROPIC_BASE_URL 覆盖),模型 deepseek-v4-flash。
// 使用 NiceEval release-pinned 公共 Claude Code Docker 镜像；环境变量可切换到项目派生版本。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "claude-code · deepseek-v4-flash · Docker sandbox",
  labels: { line: "claude" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: claudeCodeAgent({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
  }),
  flags: { memory: "baseline" },
  model: "deepseek-v4-flash",
  sandbox: dockerImageSandbox({ image: NICEEVAL_CLAUDE_CODE_DOCKER_IMAGE, lifetimeMs: 60 * 60_000 }),
  attempts: 1,
  earlyExit: true,
  timeoutMs: 1200000,
});
