# 从 NiceEval 官方维护的 codex Docker 镜像派生：删掉预装的 Yarn、把 obelisk CLI 烘进镜像、
# 声明非 root 执行身份。镜像名从早期的 memorybench-codex-noyarn 改成 memorybench-codex-obelisk
# ——它已经不只是「去 Yarn」，而是 obelisk 记忆条件专属的预制环境，见下方各段。

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
# 为什么把 `npm install -g @obelisk-apps/cli` 从运行时挪进构建期（2026-08-04，与下面「非 root」
# 一起改）：obelisk CLI 原本由 experiments/shared/obelisk.ts 的 obeliskInstall() 在 Sandbox
# 级 `.setup()` 里运行时安装，写 `/usr/local/lib/node_modules` 和 `/usr/local/bin`。这份
# Dockerfile 一旦在收尾声明 `USER node`（见下一段），容器默认执行身份就变成非 root，`node`
# 用户对 `/usr/local` 下这两个目录都没有写权限，运行时的 `npm install -g` 会直接 permission
# denied，整个 Sandbox 级 setup 报错。remem 记忆条件的二进制本来就烘进镜像、构建期以 root
# 完成，不受影响；obelisk 要达到同样的非 root 效果，唯一办法是把它的 CLI 安装也搬进构建期
# （与上游 Codex/Claude Code 官方镜像同款模式，niceeval commit cbac5659）：装的时候还是 root
# （FROM 之后没有 USER 声明，Docker 默认 root），装完再声明 `USER node`。运行时 obelisk.ts 的
# 探测函数（原 obeliskInstall，现改名 obeliskProbe）退化成薄探测，不再做真实安装——与
# remem 侧 rememPrepare() 同一个思路。
#
# 为什么要非 root（2026-08-04，r1）：这份 Dockerfile 此前一直没有声明 `USER`，容器默认以 root
# 执行。niceeval 的 Docker Sandbox 文档化契约是「非 root 是预制环境自己的义务，不是 runner
# 的强加」（niceeval docs「Docker：从官方基线继续构建」）：sandboxReuse 的复用安全检查在
# 检测到 root 身份时拒绝复用，静默把物理沙箱退休、给下一条 Attempt 新建一个全新容器。这正是
# experiments/shared/obelisk.ts 文件头「仍未解决」段记录的现象（agent 级 postSetup/preTeardown
# 钩子跨 Attempt 不共享任何写入，`$HOME` 与 `/opt` 都一样）的真实根因——不是钩子本身不共享
# 文件系统写入，是每条 Attempt 压根没有分到同一个物理容器。已用同一派生镜像做过反事实验证：
# 补上 `USER node` 后，以 uid 1000 身份跑，sandboxReuse 的复用检查通过，标记文件跨题间 reset
# 存活。`obeliskArchiveSessions()`/`obeliskRestoreSessions()` 用到的 `/opt/obelisk-session-archive`
# 需要提前 `chown` 给 `node`，否则运行时 `mkdir -p`/`cp` 会因权限不足静默失败（这两个函数的
# shell 命令都以 `; true` 收尾，权限错误不会让 preTeardown/postSetup 报错，只会让归档变成
# 无声的空操作）。
#
# 基底升级到 r4（2026-08-04，r2）：`niceeval/codex:0.144.1-r4`（NiceEval commit cbac5659）
# 把上面这段「派生层自己补 USER node」的责任收进了基底本身——r4 收尾自带 `USER node`。这不代表
# 派生层的 USER 声明可以整段删掉：基底切成非 root 之后，下面所有需要写系统目录的步骤（删 Yarn、
# `npm install -g` 写 `/usr/local/lib/node_modules`、`chown` 归档目录）都要求 root，所以派生层
# 必须先显式 `USER root` 切回去做完这些安装动作，再显式 `USER node` 收尾——这一行现在的语义是
# 「root 安装段结束后恢复基底声明的身份」，不再是「这份 Dockerfile 自己发明了非 root」。
#
# r4→r5（2026-08-05）：补齐基础镜像缺的 python3。官方 niceeval/codex Docker 镜像（node-slim
# 系）不带 python3，E2B 官方模板有——toggl-cli 隐藏 probe 依赖它，2026-08-05 本实验 5 道
# 编码题在 sandbox.prepare.eval 全挂于 `python3: command not found`。remem 派生镜像 r2 已
# 同样补过；这里对齐，不改 eval harness（避免跨实验 fingerprint）。
#
# 重建：pnpm docker:obelisk（见 scripts/build-obelisk-docker-image.sh）。

ARG BASE_IMAGE=niceeval/codex:0.144.1-r4
ARG OBELISK_VERSION=0.2.2

FROM ${BASE_IMAGE}
ARG OBELISK_VERSION

# 基底已经是非 root(USER node),接下来这几步(删 Yarn、装 python3、npm 全局装 CLI、chown 归档
# 目录)都要写只有 root 能写的路径,显式切回 root 做完再切回来。
USER root

RUN rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && rm -rf /opt/yarn-v1.22.22

# 补齐基础镜像缺的 python3——toggl-cli 隐藏 probe / installRustToolchain 探活要用，见上方 r5。
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/* \
 && python3 --version

# 烘 obelisk CLI 进镜像（root，构建期）。额外软链一份到 /usr/bin：codex 的 agent 命令子进程
# PATH 不含 /usr/local/bin（见 experiments/shared/obelisk.ts 文件头「已修：agent 命令子进程
# PATH 缺口」的完整调查记录），只有 /usr/bin 实测一定能解析到。
RUN npm install -g "@obelisk-apps/cli@${OBELISK_VERSION}" \
 && ln -sf "$(command -v obelisk)" /usr/bin/obelisk \
 && /usr/bin/obelisk --version | grep -Fx "${OBELISK_VERSION}"

# 会话归档目录预先建好并交给 node：obeliskArchiveSessions()/obeliskRestoreSessions() 在
# postSetup/preTeardown 里以 node 身份读写这里，见上方「为什么要非 root」一段。
RUN mkdir -p /opt/obelisk-session-archive && chown node:node /opt/obelisk-session-archive

# Node 工具契约第三条：运行期以 node 身份执行 `corepack enable` / `npm install -g` 要写
# /usr/local/bin 与 /usr/local/lib/node_modules（react-datepicker 等题的安装步骤用 corepack
# 装 yarn）。基底 r4 没把这两处交给运行用户，2026-08-04 全量实测切非 root 后 corepack enable
# 直接 EACCES、整批连环 errored。E2B factory 已归一同款契约，Docker 官方配方缺这一半
#（候选上游缺口，已上报）；派生层先补，上游修复后此层可删。
# 范围取整个 /usr/local 而不是契约点名的两个目录（r3→r4）：lightbox 两题用 `n` 换全局
# Node 运行时，还要写 /usr/local/n、include/node 与 share，只 chown 两个目录时在
# eval.run 阶段 EACCES（2026-08-04 实测「Node runtime swap failed」）。
RUN chown -R node:node /usr/local

# 恢复基底声明的非 root 执行身份，让 sandboxReuse 的复用安全检查真正生效——见上方两段注释。
# 装的全部内容都在这之前以 root 完成。
USER node
RUN obelisk --version
