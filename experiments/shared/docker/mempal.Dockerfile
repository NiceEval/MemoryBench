# Mempal 条件的派生 Docker 镜像。
#
# 每个 Agent 都从 NiceEval 导出的、版本钉死的公开 Docker 镜像继续构建；构建脚本把对应
# `NICEEVAL_*_DOCKER_IMAGE` 常量传给 BASE_IMAGE。稳定且重的依赖只在这里付一次：mempal
# CLI 与约 507 MB 的 HuggingFace embedding cache。运行期只做二进制/cache 薄探测和
# 每个 Eval Group 的 checkpoint 恢复/回存。

# 默认值只让独立 `docker build` 的 FROM 可解析；正式构建脚本总会以
# `NICEEVAL_*_DOCKER_IMAGE` 公开常量传入 BASE_IMAGE。
ARG BASE_IMAGE=niceeval/codex:0.144.1-r5
ARG MEMPAL_VERSION

# 与 NiceEval 目前 Debian bookworm Agent 基底同代编译，避免把宿主机 ABI 带进镜像。
FROM rust:1-bookworm AS mempal-builder
ARG MEMPAL_VERSION
RUN cargo install mempal --version "${MEMPAL_VERSION}" --locked

FROM ${BASE_IMAGE}
ARG MEMPAL_VERSION

# 官方 Agent 基底的运行身份是 node；构建期暂切 root 安装只读的 CLI，随后恢复非 root，
# 让 Eval Group 的物理 Docker Sandbox 能安全复用。
USER root
COPY --from=mempal-builder /usr/local/cargo/bin/mempal /usr/local/bin/mempal
RUN chmod 0755 /usr/local/bin/mempal

USER node

# 真实一次 ingest 预热模型 cache，并同时验证安装。warmup 数据库随后删除，Attempt 仍从
# 自己的 checkpoint 或空库开始；只有不可变模型 cache 留在镜像中。
RUN set -eux; \
    warm_dir="$(mktemp -d)"; \
    trap 'rm -rf "$warm_dir" "$HOME/.mempal"' EXIT; \
    printf '%s\n' 'niceeval mempal image warmup' > "$warm_dir/warmup.md"; \
    mempal init "$warm_dir"; \
    mempal ingest "$warm_dir" --wing memorybench-image; \
    mempal search 'niceeval mempal image warmup' --json | grep -F 'niceeval mempal image warmup'; \
    test -n "$(find "$HOME/.cache/huggingface" -name '*.safetensors' -print -quit)"; \
    mempal --help | grep -F 'Usage: mempal'
