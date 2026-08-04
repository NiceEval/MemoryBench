#!/usr/bin/env bash
set -euo pipefail

# 从官方 niceeval/codex:0.144.1-r3 派生一份烘了 remem 二进制、去掉预装 Yarn 的本地镜像，给
# experiments/shared/remem.ts 的 REMEM_DOCKER_IMAGE 用。背景与决策见
# experiments/shared/docker/codex-remem.Dockerfile 文件头注释：remem 官方预编译二进制要求
# glibc >= 2.39，与本仓库这个 Debian bookworm(glibc 2.36)基础镜像不兼容；从源码编译能绕开，
# 但每条物理 Sandbox 装一遍 Rust 工具链要 5-6 分钟，派生镜像把这笔成本收到构建期一次性付清。
# 顺手删掉预装 Yarn、补上缺的 python3——都与记忆条件无关，是这批 eval 的安装步骤与 Docker
# 镜像工具链基线的差异（Yarn：2026-08-04 由 obelisk 记忆条件的冒烟测试撞出来，obelisk 自己
# 另建了不含 remem 的 memorybench-codex-noyarn 镜像，两边互不依赖；python3：同一天全量跑
# 本实验时撞出，toggl-cli/ 的 Rust 工具链安装步骤要用它）。
#
# Tag 把 base 镜像版本号、remem 版本号、Dockerfile 配方版本号都编进去
# （memorybench-codex-remem:<base>-<remem>-<recipe>）：任一个换版本，手动同步改这里、
# Dockerfile 的 ARG 默认值/头部注释、以及 remem.ts 里的常量，旧 tag 不会被新构建覆盖，
# 避免历史结果静默错配到内容已变的新镜像上。只在本机可见，不 push 到任何 registry。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}/../experiments/shared/docker"
BASE_IMAGE="niceeval/codex:0.144.1-r3"
REMEM_VERSION="0.6.47"
DOCKERFILE_REVISION="r2"
IMAGE_TAG="memorybench-codex-remem:0.144.1-r3-${REMEM_VERSION}-${DOCKERFILE_REVISION}"

echo "==> pulling base image ${BASE_IMAGE}"
docker pull "${BASE_IMAGE}"

echo "==> building ${IMAGE_TAG} (remem ${REMEM_VERSION} built from source, --no-default-features)"
docker build \
  -t "${IMAGE_TAG}" \
  -f "${DOCKER_DIR}/codex-remem.Dockerfile" \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --build-arg "REMEM_VERSION=${REMEM_VERSION}" \
  "${DOCKER_DIR}"

echo "==> verifying remem is present, python3 is present, and yarn is gone"
docker run --rm "${IMAGE_TAG}" bash -c '
  if command -v yarn >/dev/null 2>&1 || [ -e /opt/yarn-v1.22.22 ]; then
    echo "yarn still present after derivation" >&2
    exit 1
  fi
  remem --version
  python3 --version
  node --version
  npm --version
  codex --version
'

echo "==> built ${IMAGE_TAG}"
