---
title: '官方 Codex/Bub Docker 镜像的非 root 用户无法切换 Node runtime'
severity: 'major'
target: 'niceeval'
---

NiceEval 维护的公开 `NICEEVAL_CODEX_DOCKER_IMAGE` 与 `NICEEVAL_BUB_DOCKER_IMAGE` 应既声明非 root 运行用户以支持 Eval Group 安全复用，也允许评测 fixture 在运行期使用 `corepack enable`、`npm install -g --prefix /usr/local` 和 `n <version>` 安装或切换 Node 工具链。

## Current Behavior

当前常量分别解析为 `niceeval/codex:0.144.1-r5` 与 `niceeval/bub:0.4.0-r2`。两个镜像都声明 `USER node`，但整个 `/usr/local` 仍归 root 所有且 mode 755：

```
declared-user=node
uid=1000(node) gid=1000(node)
drwxr-xr-x 1 root root ... /usr/local
mkdir: cannot create directory '/usr/local/n': Permission denied
```

MemoryBench 的 yet-another-react-lightbox Eval Group 在 sandbox setup 中运行 `npm install -g --prefix /usr/local n@10.2.0` 与 `n 22.13.0`，因此整组在 `sandbox.create` 阶段变成 unavailable：

```
Node runtime swap failed: mkdir: cannot create directory '/usr/local/n': Permission denied
```

同仓库 Codex 派生镜像此前已验证只 chown `/usr/local/bin` 与 `/usr/local/lib/node_modules` 仍不够，`n` 还会写 `/usr/local/n`、`include/node` 与 `share`；需要把整个 `/usr/local` 交给运行用户。

## Possible Solution

官方 Codex 与 Bub Docker 配方在恢复 `USER node` 之前执行 `chown -R node:node /usr/local`，并在发布验证中以默认用户运行：

```sh
npm install -g --prefix /usr/local n@10.2.0
n 22.13.0
node -p process.version
```

这应成为官方 coding-agent Docker 镜像的一致契约，而不是每个 benchmark 派生一次。

## Minimal Reproducible Example

```sh
for image in niceeval/codex:0.144.1-r5 niceeval/bub:0.4.0-r2; do
  docker run --rm "$image" sh -lc '
  id
  ls -ld /usr/local
  mkdir /usr/local/n
'
done
```

最后一条稳定返回 permission denied。

## Context

运行 compare/codex-gpt-5.6-luna 与 compare/bub-gpt-5.6-luna 的五路并行正式批次时复现。该问题不是 agent 答题失败，会把整个 Eval Group 变成基础设施 errored/unavailable；本地派生镜像只能临时恢复评测，官方镜像仍需修正。
