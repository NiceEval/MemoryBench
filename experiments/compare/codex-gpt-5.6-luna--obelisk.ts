import { defineExperiment } from "niceeval";
import { dockerImageSandbox } from "niceeval/sandbox";
import { codexAgent } from "niceeval/adapter";
import {
  obeliskArchiveSessions,
  OBELISK_DOCKER_IMAGE,
  obeliskFlags,
  obeliskProbe,
  obeliskRestoreSessions,
  obeliskSkill,
} from "../shared/obelisk.ts";

// Obelisk 的 session archive 也只存在于当前物理容器；与 Remem 一样，TTL 必须覆盖
// 最长 8-member Group 的整条 lane，不能在正常寿命轮换时丢掉前题会话。
const STATEFUL_GROUP_LIFETIME_MS = 5 * 60 * 60_000;

// codex-gpt-5.6-luna 的 Obelisk 变体:官方 Node CLI(`@obelisk-apps/cli`)把 `~/.codex/sessions`
// 索引进本地 `~/.obelisk/obelisk.sqlite`,配套 Skill 教 agent 写 JS 查询脚本经
// `obelisk --query` / `obelisk --search` 检索自己的历史会话——纯本地、无外部服务依赖,
// 与 mempal(host 侧 checkpoint 文件)、nowledge(远程中心化服务)是第三种记忆拓扑。
// 详见 shared/obelisk.ts 文件头注(2026-08-04 手工验证结论,含会话不跨 Attempt 原生持续的
// 根因排查、根因修正与归档/还原接线方案)。
//
// 对照 codex-gpt-5.6-luna.ts 看 pass 率与效率(时间/token/重复失败命令)的差异,也对照
// mempal/nowledge 两个变体看不同记忆拓扑的差异。
//
// 记忆态语义:v1 设计为一次 run 的物理沙箱内积累,由 obeliskArchiveSessions()/
// obeliskRestoreSessions() 在 preTeardown/postSetup 归档、还原会话(与 mempal checkpoint
// 同构,只是全程不出沙箱)。**此前实测不生效,根因已定案并修复**:派生镜像未声明非 root
// 执行身份,niceeval 的 Docker provider 复用安全检查拒绝 root 复用、静默退休物理沙箱、给
// 每条 Attempt 新建全新容器——不是 agent 级钩子本身不共享文件系统写入。已在
// `scripts/obelisk-docker/Dockerfile` 补 `USER node`(CLI 安装同步挪进构建期,运行时
// `obeliskProbe()` 退化成薄探测)。完整根因排查与修法见 shared/obelisk.ts 文件头「已修:
// 执行身份根因修正」段。**这个修复目前只验证到容器身份与 Docker 复用机制层面(零成本);
// 完整的多 Attempt archive/restore 流程还没有用真实 codex exec 批次验证过,全量数据仍暂缓
// 采集,需要用户批准重跑成本后再开(2026-08-04 协调决策)。**
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · obelisk",
  labels: { line: "codex" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  // postSetup 还原归档、preTeardown 归档本条会话——见文件头:执行身份根因已修,但完整跨
  // Attempt 效果还没有真实批次验证过。
  agent: codexAgent({
    skills: [obeliskSkill],
    postSetup: [obeliskRestoreSessions()],
    preTeardown: [obeliskArchiveSessions()],
  }),
  flags: { ...obeliskFlags() },
  model: "gpt-5.6-luna",
  // Docker TTL 不可续期；5 小时覆盖 8 × 30 分钟的最长 Group 和收尾余量。
  sandbox: dockerImageSandbox({ image: OBELISK_DOCKER_IMAGE, lifetimeMs: STATEFUL_GROUP_LIFETIME_MS })
    .setup(obeliskProbe()),
  earlyExit: false,
  // Group 内按声明顺序积累 session；不同仓库家族使用独立 Sandbox 并行推进。
  maxConcurrency: 4,
  // 与 codex baseline/mempal/nowledge 对齐,消除条件间超时偏置;toggl-cli 链式题需要
  // 30 分钟的 agent 超时,实验级上限不能比它更紧。
  timeoutMs: 1_800_000,
});
