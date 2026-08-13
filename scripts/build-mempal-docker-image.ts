import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  MEMPAL_DOCKERFILE_REVISION,
  MEMPAL_VERSION,
  mempalBaseImage,
  mempalDockerImage,
} from "../experiments/shared/mempal.ts";

const tool = process.argv[2];
if (tool !== "claude" && tool !== "codex") {
  throw new Error("Usage: pnpm docker:mempal <claude|codex>");
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} exited with status ${result.status ?? "unknown"}`);
  }
}

function output(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} exited with status ${result.status ?? "unknown"}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

const baseImage = mempalBaseImage(tool);
const image = mempalDockerImage(tool);
const dockerfile = fileURLToPath(new URL("../experiments/shared/docker/mempal.Dockerfile", import.meta.url));
const context = fileURLToPath(new URL("../experiments/shared/docker/", import.meta.url));
const agentBinary = tool === "claude" ? "claude" : "codex";

console.log(`==> pulling ${baseImage}`);
run("docker", ["pull", baseImage]);

console.log(
  `==> building ${image} (mempal ${MEMPAL_VERSION}, Dockerfile ${MEMPAL_DOCKERFILE_REVISION})`,
);
run("docker", [
  "build",
  "--tag", image,
  "--file", dockerfile,
  "--build-arg", `BASE_IMAGE=${baseImage}`,
  "--build-arg", `MEMPAL_VERSION=${MEMPAL_VERSION}`,
  context,
]);

const declaredUser = output("docker", ["image", "inspect", image, "--format", "{{.Config.User}}"]).trim();
if (declaredUser !== "node") {
  throw new Error(`Expected ${image} to declare USER node, got ${JSON.stringify(declaredUser || "<root>")}.`);
}

console.log("==> verifying non-root identity, Agent CLI, mempal binary, and embedding cache");
run("docker", [
  "run",
  "--rm",
  image,
  "bash",
  "-lc",
  [
    "set -eu",
    'test "$(id -u)" = "1000"',
    `command -v ${agentBinary}`,
    "mempal --help | grep -F 'Usage: mempal'",
    'test -n "$(find \"$HOME/.cache/huggingface\" -name \"*.safetensors\" -print -quit)"',
    'printf "default identity: %s (uid=%s), HOME=%s\\n" "$(whoami)" "$(id -u)" "$HOME"',
  ].join("\n"),
]);

console.log(`==> built ${image}`);
