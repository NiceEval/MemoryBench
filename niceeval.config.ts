import { defineConfig } from "niceeval";
import memory from "./reports/memory.tsx";

export default defineConfig({
  // 项目默认报告:不带 --report 时 show / view 装载它(见 niceeval defineConfig · report)。
  report: memory,

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

  timeoutMs: 600_000,

  // Docker provider 的推荐默认并发是 10；本仓库保留 headroom，避免 Attempt 收尾与下一台容器
  // 创建重叠时同时吃满本机 CPU、内存和 Docker daemon。Nowledge 还会连同宿主机上的服务与隧道，
  // 并发过高会把 laptop 压到被 SIGTERM（见 memory: memory-experiments-run-sequential）。
  // 另见 memory: niceeval-budget-probe-starves-global-semaphore。
  //
  // 注意这是**全局**上限;实验自己声明的 maxConcurrency 是独立的实验级闸,只串行化本实验,
  // 不钳全局（共享状态条件由各自 Eval Group 的串行队列保证）。
  //
  // 2026-07-30 实测:真正咬人的上限不是 Docker 容器数,而是 **x1api 代理的账号级并发**,
  // 约 5 路,且超出的请求不会立刻 429——它把连接挂住 30 秒再拒。10 路并发只活 5 路;
  // 换模型绕不开(gpt-5.6 与 gpt-5.6-sol 各 3 路同时打,总共只活 2 路,说明按账号不按模型算)。
  // 后果一:judge 预检只等 20 秒,槽位一满它看到的就是「连上了但永远不回」,整次运行在派发前
  // 硬失败(`judge precheck timed out after 20s`),错误信息指向 baseUrl / gateway,极易误诊。
  // 后果二:这个额度是**跨仓库共享**的——同一把 CODEX_API_KEY 在别的项目跑 --max-concurrency 8,
  // 这边就一个槽都抢不到。开跑前先 `ps aux | grep "niceeval exp"` 看看还有谁在跑。
  // 所以这个数字要按「同时在飞的 agent 数 ≤ 4」来配,给 judge 留一路,而不是按容器容量配。
  //
  // 全局值维持 8，实验自身的 `maxConcurrency: 4` 会把同一 Agent 条件限制在代理可承受范围；
  // 多个条件混跑时仍须以实际代理容量为准，而不是盲目抬高 Docker 并发。
  maxConcurrency: 8,
});
