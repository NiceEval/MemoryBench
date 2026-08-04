# 从 NiceEval 官方维护的 codex Docker 镜像派生，只删掉一样东西：预装的 Yarn。
#
# 背景（2026-08-04 冒烟 compare/codex-gpt-5.6-luna--obelisk 时发现）：obelisk CLI 要求
# Node >=22.13，所以这个记忆条件不能像 mempal/nowledge 那样走 e2bSandbox +
# NICEEVAL_CODEX_E2B_TEMPLATE（该模板 Node 20.9.0）——只能选 dockerImageSandbox +
# 官方 `niceeval/codex` 镜像。但 `niceeval/codex:0.144.1-r3` 由官方 `node:24-slim` 派生，
# 而**所有**官方 Node Docker 镜像（用 `node:20-slim` 交叉验证过，与 Node 大版本无关）都会
# 预装一份 Yarn Classic：`/opt/yarn-v1.22.22/` 目录 + 软链到 `/usr/local/bin/yarn` 和
# `/usr/local/bin/yarnpkg`。本仓库多道 eval（至少 react-tooltip；downshift 代码注释里
# 提到过同一类问题）的安装步骤写的是 `npm install -g yarn@1.22.22 && yarn install ...`，
# 隐含假设环境本无 Yarn——这个假设只在它们原先验证、测试过的 codex/claude E2B **官方模板**
# 上成立（该模板不预装 Yarn）。换到 Docker 镜像就必然撞
# `npm error code EEXIST / path /usr/local/bin/yarn`，6/6 attempt 全 errored。
#
# 这不是 obelisk 记忆机制本身的问题，是「选 Docker sandbox 而非 E2B 模板」这个动作暴露出的
# 通用环境差异：niceeval 官方 Docker 镜像与对应 E2B 官方模板在工具链基线上并不一致，而两者在
# 文档里被呈现为同一个 Agent 的等价可选载体。已作为上游 DX 问题上报（建议：要么官方 Docker
# 镜像构建时去掉预装 Yarn 对齐 E2B 模板，要么在文档里明确点出两种 provider 的工具链基线可能
# 不同）。本仓库不改 evals/ 里的安装步骤去将就——那会改变这些题的指纹，作废
# baseline/mempal/nowledge 三个既有实验的全部沿用结果，代价不可接受；也不在 obelisk 的
# sandbox setup 里悄悄删符号链接绕过——那是掩盖问题，不是修复。派生一个专用镜像，
# 契约干净、影响面只限于本实验自己选用的 provider。
#
# 上游把官方镜像的这个不一致修好后，直接改回引用 niceeval 导出的镜像常量，删掉这个 Dockerfile
# 和对应构建脚本。
#
# 重建：pnpm docker:obelisk（见 scripts/build-obelisk-docker-image.sh）。

FROM niceeval/codex:0.144.1-r3

RUN rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && rm -rf /opt/yarn-v1.22.22
