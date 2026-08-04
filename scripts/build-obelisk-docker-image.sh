#!/usr/bin/env bash
set -euo pipefail

# 从官方 niceeval/codex:0.144.1-r3 派生一份去掉预装 Yarn 的本地镜像，给
# experiments/shared/obelisk.ts 的 OBELISK_DOCKER_IMAGE 用。背景与决策见
# scripts/obelisk-docker/Dockerfile 文件头注释。
#
# Tag 把 base 镜像的版本号原样带过来（memorybench-codex-noyarn:<base 版本>）：base 换版本时
# 手动同步改这里和 obelisk.ts 里的常量，旧 tag 不会被新构建覆盖，避免历史结果静默错配到
# 内容已变的新镜像上。只在本机可见，不 push 到任何 registry。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_IMAGE="niceeval/codex:0.144.1-r3"
IMAGE_TAG="memorybench-codex-noyarn:0.144.1-r3"

echo "==> pulling base image ${BASE_IMAGE}"
docker pull "${BASE_IMAGE}"

echo "==> building ${IMAGE_TAG}"
docker build \
  -t "${IMAGE_TAG}" \
  -f "${SCRIPT_DIR}/obelisk-docker/Dockerfile" \
  "${SCRIPT_DIR}/obelisk-docker"

echo "==> verifying predownloaded yarn is gone"
docker run --rm "${IMAGE_TAG}" bash -c '
  if command -v yarn >/dev/null 2>&1 || [ -e /opt/yarn-v1.22.22 ]; then
    echo "yarn still present after derivation" >&2
    exit 1
  fi
  echo "yarn absent, node/npm intact:"
  node --version
  npm --version
'

echo "==> built ${IMAGE_TAG}"
