import { defineConfig } from "niceeval";
import { basalt, chalk } from "niceeval/report/built-in";
import memory from "./reports/memory.tsx";

export default defineConfig({
  // 项目默认报告:不带 --report 时 show / view 装载它(见 niceeval defineConfig · report)。
  report: memory,

  // view 的项目默认主题,官方两套切换着看:chalk 浅色圆角,basalt 暗色直角。
  // basalt 也是不配 theme 时的默认;单次覆盖用 `niceeval view --theme basalt|chalk`。
  // theme: chalk,
  theme: basalt,

  // LLM-as-judge:用代理上的 gpt-5.4-mini(与被测 agent 分离)。
  //
  // judge 的凭据只从环境来,且**只读一个名字**——不跨家族猜 CODEX_/OPENAI_(见 niceeval
  // src/scoring/judge.ts 文件头「配置从代码来,凭据从环境来」)。默认名是 NICEEVAL_JUDGE_KEY,
  // 本仓库没有这个变量,所以显式把 apiKeyEnv 指到 .env 里已有的 CODEX_API_KEY;不指的话
  // precheck 直接硬失败(`judge model gpt-5.4-mini is missing an API key`),一条 attempt 都不跑。
  //
  // baseUrl 不指定会回退到 https://api.openai.com/v1,而 gpt-5.4-mini 只在代理上有——
  // 这正是此前 judge 断言批量报 `400 tool_choice.name missing_required_parameter` 的原因:
  // 打到了不认识这个模型的端点。baseUrl 按 niceeval 的划分属于「配置」本该写死在代码里,
  // 这里读 env 是因为代理地址跟着 .env(gitignored)走,不进仓库;.env 在 config 之前加载
  // (cli.ts:613 loadDotenv → 614 import config),取值时机没问题。
  judge: {
    model: "gpt-5.4-mini",
    baseUrl: process.env.CODEX_BASE_URL,
    apiKeyEnv: "CODEX_API_KEY",
  },

  timeoutMs: 600_000,

  // e2b 账号真实并发沙箱上限实测正好是 20(RateLimitError 精确命中),niceeval 对 e2b 的
  // 推荐默认值也是 20——零 headroom:attempt 释放信号量和旧沙箱实际销毁之间有重叠窗口,
  // 新 attempt 起沙箱瞬间会被限流秒拒。所以上限一定要留 headroom,别贴着 20 写。
  // 当前取 10 而不是 19:约束已经不是 e2b 配额,而是本机——同批常带 nowledge 这类在 host
  // 侧起 docker server + 隧道的记忆条件,并发再高会把 laptop 压到被 SIGTERM
  // (见 memory: memory-experiments-run-sequential)。纯 e2b、无 host 侧服务的批次可以调高。
  // 另见 memory: e2b-sandbox-terminated-concurrency、niceeval-budget-probe-starves-global-semaphore。
  //
  // 注意这是**全局**上限;实验自己声明的 maxConcurrency 是独立的实验级闸,只串行化本实验,
  // 不钳全局(mempal 的 maxConcurrency: 1 即属此类,实测有效)。
  maxConcurrency: 10,
});
