import { NICEEVAL_CODEX_DOCKER_IMAGE } from "niceeval/sandbox";

/**
 * 官方 Codex 镜像声明 USER node，但 /usr/local 仍归 root 所有。本仓库的 Node
 * fixture 会在运行期用 npm/n 写这个前缀，因此派生层只补齐非 root Node 工具
 * 安装面的权限；上游镜像修复后删除本文件和对应构建脚本。
 */
export const CODEX_DOCKERFILE_REVISION = "r1";
export const CODEX_BASE_IMAGE = NICEEVAL_CODEX_DOCKER_IMAGE;

const baseTag = CODEX_BASE_IMAGE.slice(CODEX_BASE_IMAGE.lastIndexOf(":") + 1);

export const CODEX_DOCKER_IMAGE = `memorybench-codex:${baseTag}-${CODEX_DOCKERFILE_REVISION}`;
