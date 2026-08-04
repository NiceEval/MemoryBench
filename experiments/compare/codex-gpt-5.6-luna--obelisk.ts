import { defineExperiment } from "niceeval";
import { dockerImageSandbox } from "niceeval/sandbox";
import { codexAgent } from "niceeval/adapter";
import {
  obeliskArchiveSessions,
  OBELISK_DOCKER_IMAGE,
  obeliskFlags,
  obeliskInstall,
  obeliskRestoreSessions,
  obeliskSkill,
} from "../shared/obelisk.ts";

// codex-gpt-5.6-luna 的 Obelisk 变体:官方 Node CLI(`@obelisk-apps/cli`)把 `~/.codex/sessions`
// 索引进本地 `~/.obelisk/obelisk.sqlite`,配套 Skill 教 agent 写 JS 查询脚本经
// `obelisk --query` / `obelisk --search` 检索自己的历史会话——纯本地、无外部服务依赖,
// 与 mempal(host 侧 checkpoint 文件)、nowledge(远程中心化服务)是第三种记忆拓扑。
// 详见 shared/obelisk.ts 文件头注(2026-08-04 手工验证结论,含会话不跨 Attempt 原生持续的
// 根因排查与归档/还原接线方案)。
//
// 对照 codex-gpt-5.6-luna.ts 看 pass 率与效率(时间/token/重复失败命令)的差异,也对照
// mempal/nowledge 两个变体看不同记忆拓扑的差异。
//
// 记忆态语义:v1 设计为一次 run 的物理沙箱内积累,由 obeliskArchiveSessions()/
// obeliskRestoreSessions() 在 preTeardown/postSetup 归档、还原会话(与 mempal checkpoint
// 同构,只是全程不出沙箱)。**但目前不生效**:实测 agent 级钩子跨 Attempt 不共享任何文件系统
// 写入($HOME 与 /opt 都一样,只有 sandbox 级 .setup() 基线存活),完整证据链与候选上游
// 问题见 shared/obelisk.ts 文件头「仍未解决」段。在上游给出文档化的跨 Attempt 状态存取点
// 之前,本实验的记忆条件不成立,全量数据暂缓采集(2026-08-04 协调决策)。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · obelisk",
  labels: { line: "codex" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  // postSetup 还原归档、preTeardown 归档本条会话——设计如此,但见文件头:跨 Attempt
  // 写入目前全部不存活,这对钩子暂不产生记忆效果,保留等上游给出持久化存取点后启用。
  agent: codexAgent({
    skills: [obeliskSkill],
    postSetup: [obeliskRestoreSessions()],
    preTeardown: [obeliskArchiveSessions()],
  }),
  flags: { ...obeliskFlags() },
  model: "gpt-5.6-luna",
  // Docker 本地容器,没有 e2b 那种账号级实例寿命上限,但复用声明本身仍要求显式 lifetimeMs
  // (不填在第一条 attempt 派发前硬失败,见 niceeval docs「复用 Sandbox」)。1 小时与
  // mempal/nowledge 两个变体对齐,足够单条 Attempt(30 分钟超时上限)跑完。
  sandbox: dockerImageSandbox({ image: OBELISK_DOCKER_IMAGE, lifetimeMs: 60 * 60_000 })
    .setup(obeliskInstall()),
  sandboxReuse: true,
  earlyExit: false,
  // maxConcurrency: 1 让所有 Attempt 串行承接同一台复用的物理容器,与 mempal/nowledge 两个
  // 变体同款——这里额外是记忆条件本身的要求:obelisk 索引的是 `~/.codex/sessions` 写入顺序,
  // 并发 Attempt 会把"谁的会话先落盘"变成竞态,索引到的历史顺序不再对应真实作答顺序。
  maxConcurrency: 1,
  // 与 codex baseline/mempal/nowledge 对齐,消除条件间超时偏置;toggl-cli 链式题需要
  // 30 分钟的 agent 超时,实验级上限不能比它更紧。
  timeoutMs: 1_800_000,
});
