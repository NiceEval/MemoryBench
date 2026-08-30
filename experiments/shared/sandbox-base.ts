import {
  NICEEVAL_BUB_DOCKER_IMAGE,
  NICEEVAL_CODEX_DOCKER_IMAGE,
  changeFrequency,
  shell,
  type SandboxAction,
} from "niceeval/sandbox";

export const BUB_BASE_IMAGE = NICEEVAL_BUB_DOCKER_IMAGE;
export const CODEX_BASE_IMAGE = NICEEVAL_CODEX_DOCKER_IMAGE;

/** Active compare 的公共 SetupPrefix：从官方镜像声明式收敛 fixture 工具契约。 */
export function memorybenchBaseSetup(agent: "bub" | "codex"): SandboxAction {
  const packages = agent === "codex"
    ? "python3 curl ca-certificates build-essential pkg-config libssl-dev"
    : "python3";
  return shell({
    id: `memorybench.${agent}.base-tools`,
    command: [
      "set -eux",
      "rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg",
      "rm -rf /opt/yarn-v1.22.22",
      `apt-get update && apt-get install -y --no-install-recommends ${packages} && rm -rf /var/lib/apt/lists/*`,
      "chown -R node:node /usr/local",
      'test "$(id -u node)" = "1000"',
      "python3 --version",
    ].join("\n"),
    user: "root",
    changeFrequency: changeFrequency.rare,
    cache: { fingerprint: "base-tools-r2" },
  });
}
