#!/usr/bin/env bash
set -euo pipefail

# 从官方 niceeval/codex:0.144.1-r4 派生一份烘了 remem 二进制、去掉预装 Yarn、声明非 root
# 执行身份的本地镜像，给 experiments/shared/remem.ts 的 REMEM_DOCKER_IMAGE 用。背景与决策见
# experiments/shared/docker/codex-remem.Dockerfile 文件头注释：remem 官方预编译二进制要求
# glibc >= 2.39，与本仓库这个 Debian bookworm(glibc 2.36)基础镜像不兼容；从源码编译能绕开，
# 但每条物理 Sandbox 装一遍 Rust 工具链要 5-6 分钟，派生镜像把这笔成本收到构建期一次性付清。
# 顺手删掉预装 Yarn、补上缺的 python3——都与记忆条件无关，是这批 eval 的安装步骤与 Docker
# 镜像工具链基线的差异（Yarn：2026-08-04 由 obelisk 记忆条件的冒烟测试撞出来，obelisk 自己
# 另建了不含 remem 的 memorybench-codex-obelisk 镜像，两边互不依赖；python3：同一天全量跑
# 本实验时撞出，toggl-cli/ 的 Rust 工具链安装步骤要用它）。r3 曾在派生层末尾自补 `USER node`：
# niceeval/codex:0.144.1-r3 不声明 USER 时默认 root，sandboxReuse 复用安全检查会拒绝 root
# 复用、静默退休物理沙箱、给下一条 Attempt 开全新容器——这才是 remem.ts 记录的“postSetup 写入
# 不存活到下一条 Attempt”的真实根因，不是 niceeval 违反了 $HOME 跨题存活的文档承诺。r4
# （2026-08-04，NiceEval commit cbac5659）把 `USER node` 收进了基底本身，派生 Dockerfile 改为
# r4：不再自己发明非 root，但所有需要 root 的安装步骤（删 Yarn、装 python3、COPY 二进制）都要
# 显式 `USER root` 切回去做，收尾 `USER node` 变成“恢复基底身份”。
#
# Tag 把 base 镜像版本号、remem 版本号、Dockerfile 配方版本号都编进去
# （memorybench-codex-remem:<base>-<remem>-<recipe>）：任一个换版本，手动同步改这里、
# Dockerfile 的 ARG 默认值/头部注释、以及 remem.ts 里的常量，旧 tag 不会被新构建覆盖，
# 避免历史结果静默错配到内容已变的新镜像上。只在本机可见，不 push 到任何 registry。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}/../experiments/shared/docker"
BASE_IMAGE="niceeval/codex:0.144.1-r4"
REMEM_VERSION="0.6.47"
DOCKERFILE_REVISION="r6"
IMAGE_TAG="memorybench-codex-remem:0.144.1-r4-${REMEM_VERSION}-${DOCKERFILE_REVISION}"

echo "==> pulling base image ${BASE_IMAGE}"
docker pull "${BASE_IMAGE}"

echo "==> building ${IMAGE_TAG} (remem ${REMEM_VERSION} built from source, --no-default-features)"
docker build \
  -t "${IMAGE_TAG}" \
  -f "${DOCKER_DIR}/codex-remem.Dockerfile" \
  --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
  --build-arg "REMEM_VERSION=${REMEM_VERSION}" \
  "${DOCKER_DIR}"

echo "==> verifying declared image identity is non-root (node, uid 1000)"
DECLARED_USER="$(docker inspect "${IMAGE_TAG}" --format '{{.Config.User}}')"
if [ "${DECLARED_USER}" != "node" ]; then
  echo "expected image to declare USER node, got: '${DECLARED_USER:-<empty, defaults to root>}'" >&2
  exit 1
fi

echo "==> verifying remem is present, python3 is present, yarn is gone, and default identity is non-root"
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
  remem --version
  python3 --version
  node --version
  npm --version
  codex --version
'

echo "==> built ${IMAGE_TAG}"
