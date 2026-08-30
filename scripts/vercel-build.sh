#!/usr/bin/env bash
# Vercel 报告构建:本仓库跳过完整评测依赖安装，在 /tmp 安装静态站所需的
# niceeval + Effect + Astro，再把 node_modules 链回仓库根。NiceEval Host 仅在可信
# build 进程读取 Record，最终 site/ 只包含 MemoryBench 自己的 HTML/CSS。
set -euo pipefail

REPO="$PWD"
BUILD_DIR=/tmp/niceeval-build

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"
npm init -y >/dev/null
npm i --no-audit --no-fund niceeval@latest effect@4.0.0-rc.112 astro@7.2.9

# Vercel 的 build cache 会把上一次部署的 node_modules 原样恢复到仓库根(里面是旧版
# niceeval),ln -sfn 对已存在的目录会把链接建到目录内部而不是替换它——必须先清掉。
# 本地运行时不动真实 node_modules,直接拒绝。
if [ -e "$REPO/node_modules" ] && [ ! -L "$REPO/node_modules" ]; then
  if [ "${VERCEL:-}" = "1" ]; then
    rm -rf "$REPO/node_modules"
  else
    echo "refusing to replace real $REPO/node_modules; run in a clean clone" >&2
    exit 1
  fi
fi
ln -sfn "$BUILD_DIR/node_modules" "$REPO/node_modules"

cd "$REPO"
echo "niceeval version: $(node_modules/.bin/niceeval --version)"

node_modules/.bin/astro build --config website/astro.config.mjs
