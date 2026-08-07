import { defineExperiment } from "niceeval";
import { e2bSandbox } from "niceeval/sandbox";
import { codexAgent } from "niceeval/adapter";
import { NICEEVAL_CODEX_E2B_TEMPLATE } from "niceeval/sandbox/e2b-template";

// compare 组的另一半:同模型(gpt-5.6-luna)下的 codex,作为「没有 tape 那套记忆机制」的对照。
// bub(tape)在记忆题上若稳定高于 codex,就是 tape 价值的证据。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/", "toggl-cli-evolution/"],
  description: "codex · gpt-5.6-luna",
  labels: { line: "codex" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: codexAgent(),
  flags: { memory: "baseline" },
  model: "gpt-5.6-luna", // → ctx.model → niceeval codex adapter 写进 config.toml 的 model 行
  sandbox: e2bSandbox({ template: NICEEVAL_CODEX_E2B_TEMPLATE }),
  // 代理(base_url + key)走 .env,由 niceeval codex adapter 配成自定义 model_provider(wire_api=responses)
  earlyExit: false,
  // 三组里**只有 baseline 并行、不开复用**,这是刻意的不对称:没有记忆态就没有跨 eval 的顺序
  // 语义要保护,两个记忆条件压成串行(mempal 怕 checkpoint 踩踏、nowledge 为与 mempal 可比)
  // 纯粹是它们各自的约束,不该让 baseline 陪着慢。不开复用换来「重跑即续跑」,大批次好推进。
  // 4 = 代理账号级并发的实际可用值,见 niceeval.config.ts 那段实测;别往上调,19 那次撞了
  // e2b 的 20 沙箱硬上限。
  maxConcurrency: 4,
  // 与 claude 组对齐(重型题 mvn build / pytest 可能超 10 分钟),消除条件间超时偏置。
  // toggl-cli chain evals explicitly need a 30-minute agent deadline; keep the
  // experiment ceiling aligned so it does not truncate their per-eval timeout.
  timeoutMs: 1_800_000,
});
