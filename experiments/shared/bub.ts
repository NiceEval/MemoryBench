import { NICEEVAL_BUB_DOCKER_IMAGE } from "niceeval/sandbox";

/**
 * 官方 Bub 镜像声明 USER node，但 0.4.0-r2 的 /usr/local 仍归 root 所有。
 * 本仓库的 Node fixture 会在运行期用 corepack/npm/n 写这个前缀，因此派生层只补齐
 * 非 root Node 工具安装面的权限；上游镜像修复后删除本文件和对应构建脚本。
 */
export const BUB_DOCKERFILE_REVISION = "r1";
export const BUB_BASE_IMAGE = NICEEVAL_BUB_DOCKER_IMAGE;

const baseTag = BUB_BASE_IMAGE.slice(BUB_BASE_IMAGE.lastIndexOf(":") + 1);

export const BUB_DOCKER_IMAGE = `memorybench-bub:${baseTag}-${BUB_DOCKERFILE_REVISION}`;
