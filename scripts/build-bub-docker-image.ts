import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BUB_BASE_IMAGE,
  BUB_DOCKERFILE_REVISION,
  BUB_DOCKER_IMAGE,
} from "../experiments/shared/bub.ts";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} exited with status ${result.status ?? "unknown"}`);
  }
}

const dockerfile = fileURLToPath(new URL("./bub-docker/Dockerfile", import.meta.url));
const context = fileURLToPath(new URL("./bub-docker/", import.meta.url));

console.log(`==> pulling ${BUB_BASE_IMAGE}`);
run("docker", ["pull", BUB_BASE_IMAGE]);

console.log(`==> building ${BUB_DOCKER_IMAGE} (Dockerfile ${BUB_DOCKERFILE_REVISION})`);
run("docker", [
  "build",
  "--tag", BUB_DOCKER_IMAGE,
  "--file", dockerfile,
  "--build-arg", `BASE_IMAGE=${BUB_BASE_IMAGE}`,
  context,
]);

console.log("==> verifying non-root identity and the runtime Node installation contract");
run("docker", [
  "run",
  "--rm",
  BUB_DOCKER_IMAGE,
  "bash",
  "-lc",
  [
    "set -eu",
    'test "$(id -u)" = "1000"',
    "command -v bub",
    "npm install -g --prefix /usr/local n@10.2.0 >/dev/null",
    "n 22.13.0 >/dev/null",
    'test "$(node -p process.version)" = "v22.13.0"',
  ].join("\n"),
]);

console.log(`==> built ${BUB_DOCKER_IMAGE}`);
