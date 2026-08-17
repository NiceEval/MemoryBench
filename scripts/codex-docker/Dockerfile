ARG BASE_IMAGE=niceeval/codex:0.144.1-r5
FROM ${BASE_IMAGE}

# NiceEval 的 Docker Sandbox 要求预制镜像自己声明非 root 用户；同时本仓库的
# Node fixture 会在运行期用 npm/n 写 /usr/local。这里在构建期补齐写权限，再
# 恢复官方镜像的 node 运行身份。
USER root
RUN chown -R node:node /usr/local

USER node
RUN test "$(id -u)" = "1000" && test -w /usr/local
