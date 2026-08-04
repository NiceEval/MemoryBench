# remem 记忆条件的派生 Codex 镜像。
#
# 为什么要派生(而不是直接用 niceeval/codex:0.144.1-r3):
#
# 1. remem 官方发布的所有 Linux x64/arm64 预编译二进制(GitHub Release、npm 包装、
#    Homebrew 之外的所有下载渠道)都链接 glibc >= 2.39(实测:最新 v0.6.47 与数月前的
#    v0.5.199 都一样,不是版本挑选问题,是 remem 的发布 CI 基线本身晚于 Debian bookworm)。
#    `niceeval/codex:0.144.1-r3` 从 `node:24-slim` 派生,是 Debian bookworm,glibc 2.36 ——
#    直接跑预编译二进制会 `GLIBC_2.39' not found`。
# 2. 从源码 `cargo install remem-ai --no-default-features` 能绕开这个问题(见下),但
#    每条物理 Sandbox 都装一遍 Rust 工具链 + 编译要 5-6 分钟,复用泳道每次轮换物理
#    Sandbox 都要重付这笔成本。烘进镜像后,sandbox `.setup()` 退化成一次 `command -v remem`
#    的薄探测,和 mempal 的 e2b 模板同一个思路(见 experiments/shared/mempal.ts)。
# 3. 基础镜像预装了 Yarn(`/usr/local/bin/yarn{,pkg}` 软链到 `/opt/yarn-v1.22.22`,
#    2026-08-04 由 obelisk 记忆条件的冒烟测试撞出来的),但本仓库这批 eval 的安装步骤
#    假设环境没有 Yarn(`npm install -g --prefix /usr/local yarn@1.22.22`),装的时候
#    撞 `npm error EEXIST`。这与记忆条件无关,是 Docker 镜像与 NiceEval 官方 E2B 模板
#    的工具链基线差异(E2B 的 NICEEVAL_CODEX_E2B_TEMPLATE 没有这个问题)。上游镜像的事
#    已统一上报,这里派生时顺手删掉,不留给每条 eval 自己 workaround。
# 4. 基础镜像同样缺 `python3`(2026-08-04 全量跑 compare/codex-gpt-5.6-luna--remem 时撞出:
#    toggl-cli/ 6 条里 5 条在 `sandbox.prepare.eval` 阶段死于 `rustup-init.sh` 装完 Rust
#    工具链后紧接着 `bash: line 34: python3: command not found`,exit 127)。与第 3 点同一类
#    问题,同一处上游镜像,一起上报;这里顺手 apt 装上,免得每条需要 python3 的 eval
#    各自 workaround。
#
# --no-default-features 的代价:remem 默认开的 `local-onnx` embedding 后端依赖预编译的
# onnxruntime 静态库(`ort-sys` crate),那份预编译产物同样要求 glibc >= 2.38,即使自己
# 编译 remem 本体也会在链接期报 `undefined symbol: __isoc23_strtoll` 这类 C23 stdlib 符号
# 缺失。关掉 local-onnx 后 embedding provider 退化到 `feature-hash`(确定性非语义 fallback,
# remem 官方文档里这正是 darwin-x64 缺 onnxruntime 预编译时的同一条已文档化路径,不是
# 本仓库独有的降级)。FTS5 BM25 + entity index 检索通道不受影响;真正的记忆捕获/蒸馏路径
# (Stop hook -> `remem summarize --host codex-cli`)用的是 `executor = "codex-cli"`,
# 即再拉起 codex CLI 自己做总结,复用 codexAgent 已经配好的 CODEX_API_KEY / CODEX_BASE_URL,
# 不需要另外的 LLM API key,也不受 embedding 降级影响。
#
# 上游任一问题修复后如何回退:
# - remem 发布 glibc 2.36 兼容的预编译二进制(或本仓库升级到 glibc >= 2.39 的官方镜像)后,
#   builder stage 与 --no-default-features 都可以去掉,直接在最终 stage 里 `curl | sh` 装
#   官方二进制,`local-onnx` 也可以正常开启。
# - niceeval/codex 官方镜像发布不预装 Yarn 的新 revision(或本仓库改用 NICEEVAL_CODEX_E2B_TEMPLATE
#   等价的 Docker 版本)后,删 Yarn 那一层可以整段删除。
# - 两件事都修好后,这个派生 Dockerfile 本身可以整体退休,shared/remem.ts 改回直接引用
#   `niceeval/codex:...` 官方镜像字面量。
#
# 5. (2026-08-04,r3→r4)基底镜像收尾声明执行身份——niceeval 的 Docker Sandbox 文档化契约是
#    「非 root 是预制环境自己的义务,不是 runner 的强加」(niceeval docs「Docker：从官方基线
#    继续构建」):镜像不声明 USER 就默认 root,sandboxReuse 的复用安全检查在检测到 root 身份
#    时拒绝复用、静默把物理沙箱退休、给下一条 Attempt 开一个全新容器。`niceeval/codex:0.144.1-r3`
#    没有声明 USER(默认 root),这份派生 Dockerfile 当时（r3 配方）自己在收尾补了一行 `USER node`
#    才补上这个契约,真正的后果是 remem.ts 文件头记录的「postSetup 写入不存活到下一条 Attempt」:
#    不是 Agent 级钩子不共享文件系统写入,是每条 Attempt 压根没有分到同一个物理容器,`$HOME`
#    每次都是全新的。`niceeval/codex:0.144.1-r4`(NiceEval commit cbac5659)已经把这行 `USER node`
#    收进基底本身——派生镜像不再需要自己补,但也不能只是"删掉派生层的 USER node 就完事":
#    基底收尾已经是非 root,而这份 Dockerfile 后续所有需要写系统目录的步骤(删 Yarn、装 python3、
#    COPY 二进制到 /usr/local/bin)都要求 root,所以派生层必须先显式 `USER root` 切回去做完这些
#    安装动作,再显式 `USER node` 把身份还原成基底声明的样子——这一行现在的语义是"恢复基底身份",
#    不再是"这份派生 Dockerfile 自己发明了非 root"。已用同一派生镜像反事实验证:以 uid 1000 跑时
#    sandboxReuse 的复用检查通过,`$HOME` 标记文件跨题间 reset 存活。
#
# 重建:见 scripts/build-codex-remem-docker-image.sh(tag 与 experiments/shared/remem.ts
# 里的常量手动保持同步,不是自动计算的哈希——两边都要跟着改)。

ARG BASE_IMAGE=niceeval/codex:0.144.1-r4
ARG REMEM_VERSION=0.6.47

# ---- builder stage:与最终 stage 同代 glibc(都基于 Debian bookworm),编译产物直接可跑 ----
FROM rust:1-bookworm AS remem-builder
ARG REMEM_VERSION
RUN cargo install remem-ai --version "${REMEM_VERSION}" --bin remem \
    --no-default-features --locked

# ---- 最终 stage:派生自钉死的 niceeval 官方 Codex 镜像(r4 基底收尾已声明 USER node) ----
FROM ${BASE_IMAGE}

# 基底已经是非 root(USER node),但接下来这几步(删系统目录下的 Yarn、apt 装 python3、
# COPY 二进制到 /usr/local/bin)都要写只有 root 能写的路径,显式切回 root 做完再切回来。
USER root

# 删除预装 Yarn——本仓库的 eval 安装步骤假设环境没有它,见文件头注释第 3 点。
RUN rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && rm -rf /opt/yarn-v1.22.22

# 补齐基础镜像缺的 python3——toggl-cli 的 Rust 工具链安装步骤要用它,见文件头注释第 4 点。
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=remem-builder /usr/local/cargo/bin/remem /usr/local/bin/remem

# Node 工具契约第三条:运行期以 node 身份执行 `corepack enable` / `npm install -g` 要写
# /usr/local/bin 与 /usr/local/lib/node_modules(react-datepicker 等题的安装步骤用 corepack
# 装 yarn)。基底 r4 没把这两处交给运行用户——root 时代一切畅通,切 USER node 后 2026-08-04
# 全量实测 corepack enable 直接 EACCES、整批连环 errored。E2B factory 已归一同款契约,
# Docker 官方配方缺这一半(候选上游缺口,已上报);派生层先补,上游修复后此层可删。
RUN chown -R node:node /usr/local/bin /usr/local/lib/node_modules

# 恢复基底声明的非 root 执行身份,让 sandboxReuse 的复用安全检查真正生效——见文件头注释第 5 点。
# 除上面显式交给 node 的 Node 工具安装面外,其余内容仍是 root 属主,`node` 只有执行权限。
USER node
RUN remem --version
