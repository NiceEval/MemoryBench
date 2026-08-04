#!/usr/bin/env bash
set -euo pipefail

# 从官方 niceeval/codex:0.144.1-r4 派生一份去掉预装 Yarn、烘了 obelisk CLI、声明非 root
# 执行身份的本地镜像，给 experiments/shared/obelisk.ts 的 OBELISK_DOCKER_IMAGE 用。背景与
# 决策见 scripts/obelisk-docker/Dockerfile 文件头注释。
#
# 镜像名从早期的 memorybench-codex-noyarn 改成 memorybench-codex-obelisk（2026-08-04）：
# 配方从「只删 Yarn」变成「删 Yarn + 装 obelisk CLI + 非 root」，不再是一个可以被其它记忆条件
# 复用的通用去 Yarn 底座，旧 tag 不会被新构建覆盖，避免历史结果静默错配到内容已变的新镜像上。
#
# r1→r2（2026-08-04）：基底从 niceeval/codex:0.144.1-r3 换成 0.144.1-r4（NiceEval commit
# cbac5659），r4 把「收尾声明 USER node」收进了基底本身。派生层不再自己发明非 root，但删 Yarn/
# 装 CLI/chown 归档目录这些需要 root 的步骤都要显式 `USER root` 切回去做，见 Dockerfile。
#
# Tag 把 base 镜像版本号、obelisk 版本号、Dockerfile 配方版本号都编进去
# （memorybench-codex-obelisk:<base>-<obelisk>-<recipe>）：任一个换版本，手动同步改这里、
# Dockerfile 的 ARG 默认值/头部注释、以及 obelisk.ts 里的常量。只在本机可见，不 push 到任何
# registry——多机/CI 跑这个实验前需要各自先 `pnpm docker:obelisk` 一次。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_IMAGE="niceeval/codex:0.144.1-r4"
OBELISK_VERSION="0.2.2"
DOCKERFILE_REVISION="r4"
IMAGE_TAG="memorybench-codex-obelisk:0.144.1-r4-${OBELISK_VERSION}-${DOCKERFILE_REVISION}"

echo "==> pulling base image ${BASE_IMAGE}"
docker pull "${BASE_IMAGE}"

echo "==> building ${IMAGE_TAG} (obelisk ${OBELISK_VERSION} baked in, non-root USER node)"
docker build \
  -t "${IMAGE_TAG}" \
  -f "${SCRIPT_DIR}/obelisk-docker/Dockerfile" \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --build-arg "OBELISK_VERSION=${OBELISK_VERSION}" \
  "${SCRIPT_DIR}/obelisk-docker"

echo "==> verifying declared image identity is non-root (node, uid 1000)"
DECLARED_USER="$(docker inspect "${IMAGE_TAG}" --format '{{.Config.User}}')"
if [ "${DECLARED_USER}" != "node" ]; then
  echo "expected image to declare USER node, got: '${DECLARED_USER:-<empty, defaults to root>}'" >&2
  exit 1
fi

echo "==> verifying yarn is gone, obelisk is present, and default identity is non-root"
docker run --rm "${IMAGE_TAG}" bash -c '
  if command -v yarn >/dev/null 2>&1 || [ -e /opt/yarn-v1.22.22 ]; then
    echo "yarn still present after derivation" >&2
    exit 1
  fi
  if [ "$(id -u)" != "1000" ]; then
    echo "expected default container identity to be uid 1000 (node), got: $(id -u)" >&2
    exit 1
  fi
  echo "default identity: $(whoami) (uid=$(id -u)), HOME=$HOME"
  obelisk --version
  /usr/bin/obelisk --version
  node --version
  npm --version
  codex --version
'

echo "==> built ${IMAGE_TAG}"
