import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { e2bSandbox } from "niceeval/sandbox";
import { NICEEVAL_CODEX_E2B_TEMPLATE } from "niceeval/sandbox/e2b-template";

// dev/e2b 组:用 NiceEval release-pinned 公共 Codex 模板,CLI 已烘焙,attempt 里零安装。
//
// 这一条同时是 sandboxReuse 的 dogfooding 样本(照 niceeval docs/feature/sandbox/reuse.md 写)。
// 选 dev-e2b 的 baseline 而不是 compare 组,有两个理由:
//   1. sandboxReuse 与结果沿用**双向绝缘**——声明了就不消费历史携带、产出也不供后续携带。
//      compare 组靠续跑活着(上一轮 108 条里 11 条是携入的),开了等于每次全量真跑。
//   2. mempal 条件把记忆态的载入/回存挂在 SandboxSpec setup/teardown 上,而复用下这两个钩子
//      是**每 sandbox 一次**而不是每 attempt 一次,记忆累积语义会被悄悄改掉。baseline 无此层。
//
// 复用下题间只做 `git reset --hard` + `git clean`(排除清单含 node_modules / .npm / .cache),
// 所以 npm 产物与 $HOME、/tmp 一起跨 attempt 存活——省的正是 PR 题里最贵的装依赖那一段。
export default defineExperiment({
  description: "codex · gpt-5.4-mini · E2B sandbox(sandboxReuse)",
  agent: codexAgent(),
  flags: { memory: "baseline" },
  model: "gpt-5.4-mini",
  // 复用下 provider 必须能声明实例寿命,不声明会在第一条 attempt 派发前硬失败。
  // 取 1 小时而不是 reuse.md 示例里的 4 小时:实测 e2b 账号档位的硬上限就是 1 小时
  // (超了直接 400 `Timeout cannot be greater than 1 hours`),niceeval 不会替你悄悄压短。
  sandbox: e2bSandbox({ template: NICEEVAL_CODEX_E2B_TEMPLATE, lifetimeMs: 60 * 60_000 }),
  // 原来写的 `["memory"]` 是死选择器:仓库里既没有 memory/ 目录也没有 memory tag,选中 0 条。
  // 换成 dogfood(秒级,验接线)+ toggl-cli(Rust 冷编译最贵,正好验「/tmp 的 cargo target 缓存
  // 跨 attempt 存活」这条复用收益;6 条串起来也足以把 sandbox 寿命压过 30 分钟)。
  evals: ["dogfood/", "toggl-cli/"],
  sandboxReuse: true,
  // 复用下这就是常驻 sandbox 的条数(runner 按需创建,不预铺满)。取 2:E2B 账号级配额 20 是
  // 跟 compare 组共享的,冒烟组不该占多。
  maxConcurrency: 2,
  attempts: 1,
  earlyExit: true,
  // repomod 的 build + terminal 的 pytest 合计可能超 10 分钟;给 20 分钟宽裕。
  // 注意 timeoutMs 与 lifetimeMs 量的是两个对象,不能靠调大前者延长 sandbox 寿命。
  timeoutMs: 1200000,
});
