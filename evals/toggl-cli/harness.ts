// toggl-cli 链的共享底座。不是 eval 文件(没有 `.eval.ts` 后缀),所以 runner 发现阶段会忽略它。
//
// 本文件夹里每道 eval 都从同一个 base commit clone 真实仓库——谁也不建立在前一道的产出之上,
// 所以跨 eval 传递的只有对话里说过的话(命名、输出风格、计费口径、被否掉的选项)。每道题各自
// 建立与复用了哪些约定,见各 eval 文件头。

import { commandSucceeded } from "niceeval/expect";
import type { TestContext } from "niceeval";
import type { SandboxCommand, SandboxCommandContext } from "niceeval/sandbox";

const REPO_URL = "https://github.com/CorrectRoadH/toggl-cli.git";

/** toggl-cli @ 8646f29 —— 写这些 eval 时的仓库 tip。 */
export const BASE_COMMIT = "8646f29c87242b06eab974793a999d35b5a85b5e";

// Rust 的 baseline build tree 约 1 GiB；再给后续 agent 和测试留下足够余量，4 GiB 才报告真实的
// 空间风险。df -Pk 的单位是 1024-byte blocks，所以这里的阈值也是 KB。
export const SANDBOX_DISK_LOW_THRESHOLD_KB = 4 * 1024 * 1024;

/** 只查一次根文件系统；/opt/cargo-target 是刻意保留的 Cargo 加速缓存，不是要清理的仓库。 */
export const SANDBOX_DISK_PROBE_COMMAND = [
  "set -euo pipefail",
  "df -Pk / 2>/dev/null",
  "du -sk /opt/cargo-target 2>/dev/null",
].join("\n");

export interface SandboxDiskObservation {
  free_kb: number;
  total_kb: number;
  build_tree_kb: number;
}

export interface SandboxDiskProbeResult {
  exitCode: number | null;
  stdout: string;
  stderr?: string;
}

type SandboxDiskFactsContext = Pick<SandboxCommandContext, "facts" | "diagnostic">;

const parseSafeNonNegativeInteger = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

const formatDiskSizeGiB = (kb: number): string => `${(kb / (1024 * 1024)).toFixed(2)} GiB`;

/** 解析 `df -Pk /` 和 `du -sk /opt/cargo-target` 的原始输出；失败时返回 null，不猜数字。 */
export const parseSandboxDiskProbeOutput = (stdout: string): SandboxDiskObservation | null => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dfLine = lines.find((line) => /^.+\s+\d+\s+\d+\s+\d+\s+\d+%\s+\/$/.test(line));
  const duLine = lines.find((line) => /^\d+\s+\/opt\/cargo-target$/.test(line));
  if (!dfLine || !duLine) return null;

  const dfMatch = dfLine.match(/^.+\s+(\d+)\s+\d+\s+(\d+)\s+\d+%\s+\/$/);
  const duMatch = duLine.match(/^(\d+)\s+\/opt\/cargo-target$/);
  if (!dfMatch || !duMatch) return null;

  const total_kb = parseSafeNonNegativeInteger(dfMatch[1]);
  const free_kb = parseSafeNonNegativeInteger(dfMatch[2]);
  const build_tree_kb = parseSafeNonNegativeInteger(duMatch[1]);
  if (
    total_kb === null ||
    free_kb === null ||
    build_tree_kb === null ||
    total_kb === 0 ||
    free_kb > total_kb
  ) {
    return null;
  }
  return { free_kb, total_kb, build_tree_kb };
};

/** 记录空间观测；成功只写 facts，低空间才写风险 warning，失败不写任何伪造 facts。 */
export const reportSandboxDiskProbe = (
  ctx: SandboxDiskFactsContext,
  result: SandboxDiskProbeResult,
): SandboxDiskObservation | null => {
  if (result.exitCode !== 0) {
    const detail = result.stderr?.trim().slice(-300);
    ctx.diagnostic({
      code: "sandbox-space-probe-failed",
      level: "warning",
      message:
        `sandbox 磁盘空间观测退化：探针命令退出码 ${result.exitCode ?? "unknown"}，未记录磁盘 facts` +
        (detail ? `；${detail}` : ""),
    });
    return null;
  }

  const observation = parseSandboxDiskProbeOutput(result.stdout);
  if (!observation) {
    ctx.diagnostic({
      code: "sandbox-space-probe-failed",
      level: "warning",
      message: "sandbox 磁盘空间观测退化：探针输出格式无法解析，未记录磁盘 facts",
    });
    return null;
  }

  ctx.facts("sandbox.disk.free_kb", observation.free_kb);
  ctx.facts("sandbox.disk.total_kb", observation.total_kb);
  ctx.facts("sandbox.build_tree.kb", observation.build_tree_kb);

  if (observation.free_kb < SANDBOX_DISK_LOW_THRESHOLD_KB) {
    ctx.diagnostic({
      code: "sandbox-disk-space-low",
      level: "warning",
      message:
        `sandbox 磁盘空间偏低：剩余 ${formatDiskSizeGiB(observation.free_kb)} / ` +
        `总量 ${formatDiskSizeGiB(observation.total_kb)}，` +
        `/opt/cargo-target 构建树 ${formatDiskSizeGiB(observation.build_tree_kb)}，` +
        `低空间阈值 ${formatDiskSizeGiB(SANDBOX_DISK_LOW_THRESHOLD_KB)}`,
      data: {
        free_kb: observation.free_kb,
        total_kb: observation.total_kb,
        build_tree_kb: observation.build_tree_kb,
        threshold_kb: SANDBOX_DISK_LOW_THRESHOLD_KB,
      },
    });
  }
  return observation;
};

/** UTC 当天(YYYY-MM-DD)。探针把 TZ 钉成 UTC,好让 CLI 跟我们对齐。 */
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Eval layer command:系统包 + Rust 工具链,以 root 装,好让它们落在工作副本之外、永不进 agent diff。
 *
 * `keyring` 需要 libdbus,`reqwest`/`openssl-sys` 需要 libssl + pkg-config(仓库自己的 AGENTS.md
 * 里有记)。工具链装到 /usr/local/{rustup,cargo} 而不是某个用户 home,这样 agent 开的每个 shell、
 * 以及判分用的 shell,看到的都是同一个 cargo,不管它是不是 source 过 ~/.profile 的登录 shell。
 *
 * 这段必须幂等重放:sandboxReuse 下同一个沙箱要依次承接多道题,本函数每题都重跑一遍。
 * 曾经的写法是「探测到 cargo 就整块跳过」,而 RUSTUP_HOME 只在被跳过的那个分支里导出,于是
 * 第二题起 rustup 去找空的 ~/.rustup,`cargo --version` 报 "could not choose a version of
 * cargo ... no default is configured",每条泳道除首题外全 errored(2026-07-29 e2b 复用实测)。
 * 现在按 niceeval docs「幂等是硬要求」重写:探测只护住「下载安装 rustup 本体」这一步(装二进制
 * 没法声明式表达),工具链状态一律交给无条件的 `rustup default stable` 收敛,环境变量在脚本顶层
 * 无条件导出、并写进 /etc/profile.d 供后续 shell 用。
 */
export const installRustToolchain: SandboxCommand = async (sandbox, ctx) => {
  ctx.progress({ message: "installing build deps + rust toolchain" });
  const script = [
    "set -euo pipefail",
    "export DEBIAN_FRONTEND=noninteractive",
    "if command -v apt-get >/dev/null 2>&1; then",
    // 等锁而不是撞锁:沙箱刚起来时镜像自己的 apt 可能还在跑,直接 update 会秒挂在
    // `Could not get lock /var/lib/dpkg/lock-frontend`(复用下实测 3 条 attempt 这么死的)。
    // DPkg::Lock::Timeout 让 apt 排队等而不是立刻失败,是声明式的等价写法。
    "  APT_WAIT='-o DPkg::Lock::Timeout=300'",
    "  apt-get $APT_WAIT update -qq",
    "  apt-get $APT_WAIT install -y -qq --no-install-recommends pkg-config libssl-dev libdbus-1-dev build-essential curl ca-certificates >/dev/null",
    // 回收 apt 包列表:有 attempt 中途死于一句光秃秃的 "terminated",最可能的解读是沙箱空间耗尽,
    // 所以每一百 MB 都值得抠。
    "  apt-get clean && rm -rf /var/lib/apt/lists/*",
    "fi",
    // 无条件导出:rustup 的 proxy 靠 RUSTUP_HOME 找工具链,漏掉它就会退回空的 ~/.rustup。
    "export RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo",
    // 唯一的探测:rustup 本体在不在。装二进制这件事没法用「目标状态」表达,只能问一次;
    // 但它只护住下载,不再护住任何工具链状态。镜像自带 rustup 时这一步天然跳过。
    'if [ ! -x "$CARGO_HOME/bin/rustup" ] && ! command -v rustup >/dev/null 2>&1; then',
    // profile=default 与仓库的 rust-toolchain.toml 一致,这样 `cargo fmt` 和 `cargo clippy`
    // (AGENTS.md 让 agent 跑的)才真的存在。
    "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile default --default-toolchain stable --no-modify-path >/dev/null",
    "  chmod -R a+rwX /usr/local/rustup /usr/local/cargo",
    "fi",
    'RUSTUP_BIN="$(command -v rustup || echo "$CARGO_HOME/bin/rustup")"',
    // 声明目标状态,无条件重放:半截的 rustup(有二进制、没配默认工具链)在这里收敛,
    // 已经配好的则是一句空转。缺 rustfmt/clippy 的半截 profile 同理补齐。
    '"$RUSTUP_BIN" default stable >/dev/null',
    '"$RUSTUP_BIN" component add rustfmt clippy >/dev/null 2>&1 || true',
    'CARGO_BIN_DIR="$(dirname "$RUSTUP_BIN")"',
    "for tool in cargo rustc rustup rustfmt cargo-fmt cargo-clippy clippy-driver; do",
    '  [ -x "$CARGO_BIN_DIR/$tool" ] && ln -sf "$CARGO_BIN_DIR/$tool" /usr/local/bin/$tool',
    "done",
    // agent / 判分用的登录 shell 也要拿到 RUSTUP_HOME,否则 /usr/local/bin/cargo 这个 proxy
    // 同样会退回空的 ~/.rustup —— 只导 PATH 是不够的。
    "printf 'export RUSTUP_HOME=%s\\nexport CARGO_HOME=%s\\nexport PATH=\"%s:$PATH\"\\n' \"$RUSTUP_HOME\" \"$CARGO_HOME\" \"$CARGO_BIN_DIR\" > /etc/profile.d/rust.sh",
    "chmod +x /etc/profile.d/rust.sh",
    // 让 cargo 的构建目录留在工作副本之外。这个 crate 的 debug build 约 1GB,留在 workdir 下面会
    // 让收尾抓 diff 的阶段变得不稳(attempt 死于 "capturing diff · fetch failed" 和
    // "export agent windows failed")。放 /opt 而不是 /tmp 是刻意的:若沙箱把 /tmp 挂成 tmpfs,
    // 1GB 构建树会记在内存上、把沙箱 OOM 掉。用配置文件而不是环境变量,好让它对每一次 cargo 调用
    // (我们的和 agent 的)都生效,不管那个 shell 有没有 source 过 /etc/profile.d。
    "mkdir -p /opt/cargo-target && chmod 1777 /opt/cargo-target",
    'for home in /root /home/*; do',
    '  [ -d "$home" ] || continue',
    '  mkdir -p "$home/.cargo"',
    "  printf '[build]\\ntarget-dir = \"/opt/cargo-target\"\\n\\n[profile.dev]\\ndebug = false\\n' > \"$home/.cargo/config.toml\"",
    '  chmod -R a+rwX "$home/.cargo" 2>/dev/null || true',
    "done",
    'if [ -n "${CARGO_HOME:-}" ] || [ -d /usr/local/cargo ]; then',
    "  printf '[build]\\ntarget-dir = \"/opt/cargo-target\"\\n\\n[profile.dev]\\ndebug = false\\n' > \"${CARGO_HOME:-/usr/local/cargo}/config.toml\"",
    "fi",
    "cargo --version",
    "python3 --version",
  ].join("\n");

  const installed = await sandbox.runCommand("bash", ["-lc", script], { user: "root" });
  if (installed.exitCode !== 0) {
    throw new Error(`rust toolchain setup failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`);
  }
};

/**
 * 把真实仓库在 BASE_COMMIT clone 到 workdir 根目录,并预热构建缓存。
 *
 * checkout 必须落在 workdir 根:嵌套子目录会被 diff 分类账记成 gitlink,agent 的改动就从证据里
 * 消失了。base commit 之后的历史(remote/tags/reflog)全抹掉,这样 agent 没法从自己的 checkout 里
 * 读到这个项目的"未来"。
 */
export const prepareRepo: SandboxCommand = async (sandbox, ctx) => {
  ctx.progress({ message: "cloning toggl-cli @ base commit" });
  const cloned = await sandbox.runShell(
    [
      "set -euo pipefail",
      // 幂等:上一题留下的 .git 活得过题间 git clean(分类账在任意深度排除 .git),先删再 clone。
      // 不删的话第二题 `mv` 会撞上非空的 .git、第三题 `git remote remove origin` 会撞上
      // 已被上一题删掉的 remote —— 2026-07-29 e2b 复用实测里两种都撞到了。
      // 临时目录名与其它真实仓库 eval 统一成 .niceeval-clone,并进各 eval 的 diff.ignore。
      "rm -rf .git .niceeval-clone",
      `git clone -q -o origin ${REPO_URL} .niceeval-clone`,
      "mv .niceeval-clone/.git .git",
      "rm -rf .niceeval-clone",
      `git reset -q --hard ${BASE_COMMIT}`,
      "git remote remove origin",
      "git tag -l | xargs -r git tag -d >/dev/null",
      "git reflog expire --expire=now --all",
      "git gc -q --prune=now",
      // 与其它真实仓库 eval 同款的自检:base commit 之后不应有任何东西可见
      `TS=$(git show -s --format=%ci ${BASE_COMMIT})`,
      'COUNT=$(git log --oneline --since="$TS" | wc -l)',
      '[ "$COUNT" -eq 1 ]',
    ].join("\n"),
  );
  if (cloned.exitCode !== 0) {
    throw new Error(`toggl-cli checkout failed: ${(cloned.stderr || cloned.stdout).trim().slice(-500)}`);
  }

  // 预先把依赖构建预热一次。不预热的话,agent 要从自己的时间预算里付一次数分钟的冷 `cargo build`
  // ——那会变成一个与记忆无关的条件间差异。
  ctx.progress({ message: "warming cargo build cache (cold dependency build)" });
  const built = await sandbox.runShell(
    [
      // 与 /etc/profile.d/rust.sh 同款三件套:这是非登录 shell,拿不到 profile.d,
      // 只导 PATH 会让 rustup proxy 退回空的 ~/.rustup(见 installRustToolchain 文件注)。
      'export RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo',
      'export PATH="/usr/local/cargo/bin:$PATH"',
      "cargo build --tests --quiet",
    ].join("\n"),
  );
  if (built.exitCode !== 0) {
    throw new Error(`baseline cargo build failed: ${(built.stderr || built.stdout).trim().slice(-800)}`);
  }

  // 这是中性遥测：空间正常时只写 facts，不把每次预热都误报成 warning。
  try {
    const disk = await sandbox.runShell(SANDBOX_DISK_PROBE_COMMAND);
    reportSandboxDiskProbe(ctx, disk);
  } catch (error) {
    // 探针不是评测本身的必要条件；命令 API 抛错时保留退化观测并继续后续 agent/test。
    reportSandboxDiskProbe(ctx, {
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    });
  }
};

/** 一个假 API 窗口:请求路径含 `contains` 时返回 `entries`。 */
export interface ProbeWindow {
  contains: string;
  entries: unknown[];
}

export interface ProbePlan {
  windows?: ProbeWindow[];
  default_entries?: unknown[];
  projects?: unknown[];
  cases: { name: string; args: string[] }[];
}

export interface ProbeCase {
  name: string;
  args: string[];
  /** 命令超时时为 null。 */
  exit: number | null;
  stdout: string;
  stderr: string;
  /** 非空的 stdout 行,连续空白折叠成一个空格。 */
  lines: string[];
  /** 本 case 里 CLI 请求过的 API 路径(含 query string)。 */
  requests: string[];
}

/**
 * 检查 `expected` 这几行是否按顺序出现在某个 case 的 stdout 里。
 *
 * 刻意用「按序子序列」而不是「逐行精确匹配」:标题行、`------` 分隔线、`── 2026-07-23 Thursday ──`
 * 这类分组头,都是实现可以合理添加的东西,跟这些 eval 要考的约定毫无关系。逐行精确匹配曾把一次
 * 渲染完全正确的运行判成失败。仍然抓得住的:时长渲染错、顺序错、缺行、空结果没打 `(no data)`
 * ——因为那些改的是行本身,而不是行周围。
 */
export const orderedLines = (probeCase: ProbeCase, expected: string[]) => {
  let cursor = 0;
  for (const line of probeCase.lines) {
    if (line === expected[cursor]) cursor += 1;
  }
  return {
    ok: cursor === expected.length,
    message:
      `expected these lines, in this order: ${JSON.stringify(expected)}\n` +
      `actual stdout lines: ${JSON.stringify(probeCase.lines)}`,
  };
};

/**
 * 构建 agent 留下的代码,把计划里每条 CLI 调用都对着一个一次性 HTTP stub 跑一遍,把每条干了什么
 * 交回来。断言留在 eval 文件里——一条约定一条——这样失败的运行能显示是哪条约定没做到,而不是
 * 笼统一句"测试失败"。
 *
 * 前置门:crate 编译不过、或探针跑不起来,eval 就在这里停住。
 */
export const runProbe = async (
  t: TestContext,
  plan: ProbePlan,
): Promise<Record<string, ProbeCase>> => {
  // agent 最后一轮之后才传输隐藏 probe；本地 source 由 transfer manifest 自动计入身份。
  await t.sandbox.uploadFile(
    new URL("_support/probe.py", import.meta.url),
    "tests/probe.py",
  );
  await t.sandbox.uploadFile(
    new URL("_support/run-probe.sh", import.meta.url),
    "tests/run-probe.sh",
  );
  await t.sandbox.writeText("tests/probe-plan.json", JSON.stringify(plan, null, 2));

  t.progress({ message: "building the agent's code and probing the CLI" });
  const probe = await t.sandbox.runShell("bash tests/run-probe.sh");
  // 与 prepare command 里的 cargo target-dir 重定向双保险:万一真有东西落进 workdir 的 target/,
  // 在 niceeval 遍历工作树抓 diff 之前先删掉。
  await t.sandbox.runShell("rm -rf target");
  await t.require(probe, commandSucceeded());

  const parsed = JSON.parse(probe.stdout) as { cases: ProbeCase[] };
  return Object.fromEntries(parsed.cases.map((probeCase) => [probeCase.name, probeCase]));
};
