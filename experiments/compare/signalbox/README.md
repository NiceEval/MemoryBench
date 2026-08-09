# Signalbox 对照实验

这层只选择 `signalbox/`，不会改变原有 compare benchmark 的题目分母。首次矩阵先接
Codex no-memory 与 Mempal；两者同模型、同顺序、同 attempt timeout。

两组的差异只有是否安装 Signalbox 的 Mempal 记忆协议：baseline 每题都从零开始；Mempal 每题开始先从专属 checkpoint
恢复并检索产品历史，结束前只保存产品规则及其新增、替代、撤销关系。每个 condition 的 `signalbox` Eval Group
各自复用一座 Docker sandbox；成员间会重置 workdir 并重新放入同一份 starter，但 `$HOME` 等 sandbox 状态会保留。
baseline 使用相同的分组、调度和复用拓扑，避免把容器生命周期差异混入记忆效果。

运行前先用 `pnpm --silent niceeval exp compare/signalbox --dry` 核对计划。正式运行会产生模型与本机 Docker 资源成本，必须先取得
用户批准。结果应重点逐题比较 02、05、07、09 四个 checkpoint；01、03、04、06、08 是编码能力控制题。

正式运行 Mempal 前设置一个从未使用过的 `MEMPAL_COHORT`，并从 01 开始跑完整目录。不要把一次中断后
继续污染旧 checkpoint 的轨迹与干净批次混报。全量运行会产生模型和沙箱费用，仍需用户批准。

暂不复制 Nowledge 配置：当前 helper 的 `NOWLEDGE_COHORT` 只进入结果身份，不会在远端 default Space 中
隔离实际记忆内容；给它换标签并不能获得干净历史。等 provider/helper 能声明真正的 per-cohort Space 后，
再把 Nowledge 加进这组，避免用名字伪造隔离。
