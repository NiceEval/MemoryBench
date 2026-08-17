import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CODEX_BASE_IMAGE,
  CODEX_DOCKERFILE_REVISION,
  CODEX_DOCKER_IMAGE,
} from "../experiments/shared/codex.ts";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} exited with status ${result.status ?? "unknown"}`);
  }
}

const dockerfile = fileURLToPath(new URL("./codex-docker/Dockerfile", import.meta.url));
const context = fileURLToPath(new URL("./codex-docker/", import.meta.url));

console.log(`==> pulling ${CODEX_BASE_IMAGE}`);
run("docker", ["pull", CODEX_BASE_IMAGE]);

console.log(`==> building ${CODEX_DOCKER_IMAGE} (Dockerfile ${CODEX_DOCKERFILE_REVISION})`);
run("docker", [
  "build",
  "--tag", CODEX_DOCKER_IMAGE,
  "--file", dockerfile,
  "--build-arg", `BASE_IMAGE=${CODEX_BASE_IMAGE}`,
  context,
]);

console.log("==> verifying non-root identity and the runtime Node installation contract");
run("docker", [
  "run",
  "--rm",
  CODEX_DOCKER_IMAGE,
  "bash",
  "-lc",
  [
    "set -eu",
    'test "$(id -u)" = "1000"',
    "command -v codex",
    "npm install -g --prefix /usr/local n@10.2.0 >/dev/null",
    "n 22.13.0 >/dev/null",
    'test "$(node -p process.version)" = "v22.13.0"',
  ].join("\n"),
]);

console.log(`==> built ${CODEX_DOCKER_IMAGE}`);
