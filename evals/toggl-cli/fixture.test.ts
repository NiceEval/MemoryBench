import assert from "node:assert/strict";
import test from "node:test";

import {
  reportSandboxDiskCheck,
  SANDBOX_DISK_LOW_THRESHOLD_KB,
  SANDBOX_DISK_CHECK_COMMAND,
  type SandboxDiskCheckResult,
} from "./fixture.ts";

const checkOutput = (free_kb: number, total_kb: number, build_tree_kb: number) =>
  [
    "Filesystem 1024-blocks Used Available Capacity Mounted on",
    `overlay ${total_kb} ${total_kb - free_kb} ${free_kb} 10% /`,
    `${build_tree_kb} /opt/cargo-target`,
  ].join("\n");

const fakeContext = () => {
  const facts = new Map<string, string | number | boolean>();
  const diagnostics: unknown[] = [];
  return {
    ctx: {
      facts(key: string, value: string | number | boolean) {
        facts.set(key, value);
      },
      diagnostic(input: unknown) {
        diagnostics.push(input);
      },
    },
    facts,
    diagnostics,
  };
};

const result = (stdout: string, exitCode = 0): SandboxDiskCheckResult => ({
  exitCode,
  stdout,
});

test("正常空间只记录三个数值 facts，不发 warning", () => {
  const { ctx, facts, diagnostics } = fakeContext();

  reportSandboxDiskCheck(
    ctx,
    result(checkOutput(SANDBOX_DISK_LOW_THRESHOLD_KB, SANDBOX_DISK_LOW_THRESHOLD_KB * 2, 1_000_000)),
  );

  assert.deepEqual(Object.fromEntries(facts), {
    "sandbox.disk.free_kb": SANDBOX_DISK_LOW_THRESHOLD_KB,
    "sandbox.disk.total_kb": SANDBOX_DISK_LOW_THRESHOLD_KB * 2,
    "sandbox.build_tree.kb": 1_000_000,
  });
  assert.deepEqual(diagnostics, []);
});

test("低于阈值时保留 facts 并发真实风险 warning", () => {
  const { ctx, facts, diagnostics } = fakeContext();
  const free_kb = 3 * 1024 * 1024;
  const total_kb = SANDBOX_DISK_LOW_THRESHOLD_KB * 2;
  const build_tree_kb = 1_048_576;

  reportSandboxDiskCheck(ctx, result(checkOutput(free_kb, total_kb, build_tree_kb)));

  assert.equal(facts.get("sandbox.disk.free_kb"), free_kb);
  assert.equal(facts.get("sandbox.disk.total_kb"), total_kb);
  assert.equal(facts.get("sandbox.build_tree.kb"), build_tree_kb);
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0], {
    code: "sandbox-disk-space-low",
    level: "warning",
    message:
      "sandbox 磁盘空间偏低：剩余 3.00 GiB / 总量 8.00 GiB，" +
      "/opt/cargo-target 构建树 1.00 GiB，低空间阈值 4.00 GiB",
    data: {
      free_kb,
      total_kb,
      build_tree_kb,
      threshold_kb: SANDBOX_DISK_LOW_THRESHOLD_KB,
    },
  });
});

test("检查命令失败时只报告观测退化，不伪造 facts", () => {
  const { ctx, facts, diagnostics } = fakeContext();

  reportSandboxDiskCheck(ctx, { exitCode: 1, stdout: "", stderr: "df failed" });

  assert.deepEqual(Object.fromEntries(facts), {});
  assert.equal(diagnostics.length, 1);
  assert.equal((diagnostics[0] as { code: string }).code, "sandbox-space-check-failed");
  assert.match((diagnostics[0] as { message: string }).message, /退出码 1/);
});

test("检查输出畸形时只报告观测退化，不伪造 facts", () => {
  const { ctx, facts, diagnostics } = fakeContext();

  reportSandboxDiskCheck(ctx, result("not df or du output"));

  assert.deepEqual(Object.fromEntries(facts), {});
  assert.equal(diagnostics.length, 1);
  assert.equal((diagnostics[0] as { code: string }).code, "sandbox-space-check-failed");
  assert.match((diagnostics[0] as { message: string }).message, /格式无法解析/);
});

test("检查只查询根文件系统一次，不对 /opt 重复跑 df", () => {
  assert.equal((SANDBOX_DISK_CHECK_COMMAND.match(/^df -Pk \/ /gm) ?? []).length, 1);
  assert.equal((SANDBOX_DISK_CHECK_COMMAND.match(/^df -Pk \/opt/gm) ?? []).length, 0);
});
