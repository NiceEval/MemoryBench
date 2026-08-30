import { defineConfig } from "niceeval";

export default defineConfig({
  // LLM-as-judge:**本文件不配 judge,一律配在用到它的那条 eval 上**(`defineEval({ judge })`,
  // 目前只有 evals/toggl-cli/04-billing-doc.eval.ts)。
  //
  // 理由是指纹作用域:judge 配置进指纹,写在这里就是全仓库共用一个,换一次评审模型把所有
  // eval 的沿用结果一起作废——包括根本不碰 judge 的那些。2026-07-30 实测过这个代价:全局
  // judge 从 gpt-5.6 换成 gpt-5.6-sol 后,`exp compare/codex toggl-cli/ --dry` 只剩 1/18 可沿用
  // (其中 12 条另有原因:当时的实验级复用配置与沿用双向绝缘)。写在 eval 上,换模型只作废那一条。
  // 想加新的 judge 题就在那条 eval 里写自己的 judge 块,不要图省事挪回这里。
  //
  // 下面这几段坑是配 judge 时(不论配在哪)都要知道的,留在这儿当索引 ——
  //
  // 原来钉的 gpt-5.4-mini 从 2026-07-30 起被代理下架(chat/completions 与 responses 都返
  // 404 `not supported by any configured account in this group`),judge 路径同样中招,
  // 所以必须换。代理现存 gpt-5.4 / 5.5 / 5.6 / 5.6-luna / 5.6-sol / 5.6-terra,没有 mini 档。
  // 不跟着 agent 一起换成 gpt-5.6-luna:compare 组的被测 agent 就是 gpt-5.6-luna,judge
  // 用同一个模型等于自评。目前只有 toggl-cli/04-billing-doc 走 judge。
  //
  // 选 gpt-5.6 是实测选出来的,别凭名字挑。同一句「回 yes」的往返(2026-07-30 实测):
  // gpt-5.6 4.4s · gpt-5.6-sol 4.2s · gpt-5.4 10.6s · gpt-5.6-luna 13.8s · gpt-5.6-terra 20.7s,
  // gpt-5.5 直接 429 并发超限。judge 预检只给 20s,先钉的 gpt-5.4 正是慢到把它耗光才发现
  // (`judge precheck timed out after 20s`)——代理并发一上来,10s 基线必然翻车。
  //
  // judge 的凭据只从环境来,且**只读一个名字**——不跨家族猜 CODEX_/OPENAI_(见 niceeval
  // src/scoring/judge.ts 文件头「配置从代码来,凭据从环境来」)。默认名是 NICEEVAL_JUDGE_KEY,
  // 本仓库没有这个变量,所以显式把 apiKeyEnv 指到 .env 里已有的 CODEX_API_KEY;不指的话
  // precheck 直接硬失败(`judge model gpt-5.6 is missing an API key`),一条 attempt 都不跑。
  //
  // baseUrl 不指定会回退到 https://api.openai.com/v1,而这些模型只在代理上有——
  // 这正是此前 judge 断言批量报 `400 tool_choice.name missing_required_parameter` 的原因:
  // 打到了不认识这个模型的端点。baseUrl 按 niceeval 的划分属于「配置」本该写死在代码里,
  // 这里读 env 是因为代理地址跟着 .env(gitignored)走,不进仓库;.env 在 config 之前加载
  // (cli.ts:613 loadDotenv → 614 import config),取值时机没问题。
  // 2026-07-30 晚续:钉的 gpt-5.6 自己也被下架了(judge 路径返同一句 404,`toggl-cli/04-billing-doc`
  // 在三个 compare 实验里全部 errored)。换 gpt-5.6-sol —— 当晚重测存活情况:
  // gpt-5.6 已 404;gpt-5.6-sol 2s · gpt-5.6-terra 2s · gpt-5.6-luna 2s · gpt-5.4 3s · gpt-5.5 3s 均正常。
  // 选 sol 而不是 luna 的理由不变(luna 是被测 agent,同模型等于自评)。
  // 教训:代理的可用模型清单是会随时变的运行时事实,这里钉的任何名字都可能明天就没了;
  // 看到 `judge precheck failed` 先分清 404(模型下架,换名字)与 timed out(并发占满,见下面 maxConcurrency 那段),
  // 两者报错都指向 baseUrl,极易误诊。探活一条 curl 就够,别靠改配置试。

  // compare 的重型仓库题与链式记忆题按 30 分钟设计；全局值不能把实验级上限截回 10 分钟。
  timeoutMs: 1_800_000,

  // 全局硬上限同时约束多实验首次 SetupPrefix miss，避免多个 Attempt 并发编译
  // mempal/remem 形成 cache stampede 并触发 OOM；各实验仍按 Eval Group 设置 lane 并发。
  // 另见 memory: niceeval-budget-probe-starves-global-semaphore。
  //
  // 注意这是**全局**上限;实验自己声明的 maxConcurrency 是独立的实验级闸,只串行化本实验,
  // 不钳全局（共享状态条件由各自 Eval Group 的串行队列保证）。
  //
  maxConcurrency: 10,
});
