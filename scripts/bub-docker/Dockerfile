ARG BASE_IMAGE=niceeval/bub:0.4.0-r2
FROM ${BASE_IMAGE}

# NiceEval 的 Docker Sandbox 要求预制镜像自己声明非 root 用户；同时本仓库的
# Node fixture 会在运行期用 corepack/npm/n 写 /usr/local。官方 Bub r2 只满足前者，
# 这里在构建期补齐后者，再恢复原来的 node 运行身份。
USER root
RUN chown -R node:node /usr/local

USER node
RUN test "$(id -u)" = "1000" && test -w /usr/local
