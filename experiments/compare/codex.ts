import { defineExperiment } from "niceeval";
import { dockerSandbox } from "niceeval/sandbox";
import { codexAgent } from "niceeval/adapter";
import { CODEX_BASE_IMAGE, memorybenchBaseSetup } from "../shared/sandbox-base.ts";

// compare 组的另一半:同模型(gpt-5.6-luna)下的 codex,作为「没有 tape 那套记忆机制」的对照。
// bub(tape)在记忆题上若稳定高于 codex,就是 tape 价值的证据。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna",
  labels: { line: "codex", memory: "baseline" },  // 报告坐标必须随 sealed Run 保存，网页不读取私有 flags
  agent: codexAgent(),
  flags: { memory: "baseline" },
  model: "gpt-5.6-luna", // → ctx.model → niceeval codex adapter 写进 config.toml 的 model 行
  // Eval Group 拥有复用边界；派生镜像只修复非 root Node runtime 安装权限。
  sandbox: dockerSandbox({ source: { type: "image", image: CODEX_BASE_IMAGE }, lifetimeMs: 60 * 60_000 })
    .before(memorybenchBaseSetup("codex")),
  // 代理(base_url + key)走 .env,由 niceeval codex adapter 配成自定义 model_provider(wire_api=responses)
  earlyExit: false,
  // 每个 Eval Group 内串行复用一台 Sandbox，6 个 Group 彼此并行。
  // One long-lived Sandbox per compare maximizes physical reuse; the repo cap is 10.
  maxConcurrency: 1,
  // 与 claude 组对齐(重型题 mvn build / pytest 可能超 10 分钟),消除条件间超时偏置。
  // toggl-cli chain evals explicitly need a 30-minute agent deadline; keep the
  // experiment ceiling aligned so it does not truncate their per-eval timeout.
  timeoutMs: 1_800_000,
});
