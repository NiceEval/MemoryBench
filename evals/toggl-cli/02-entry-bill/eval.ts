import { defineEval } from "niceeval";
import { equals, isTrue } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";

import { prepareRepo } from "../fixture.ts";
import { orderedLines, parseJsonOutput, runVerifier, type VerifierPlan } from "../verifier.ts";

// 链的第 2 题。引入这家店的计费口径。
//
// 本题建立:
//   R-round  只算 billable=true 且已结束的条目,每条时长按 15 分钟向上取整后再求和
//
// 本题复用:R4(空结果打 `(no data)` 并 exit 0)、R5(不加新依赖),来自第 1 题。
//
// 本题自包含:计费规则和输出格式都在自己 prompt 里写清。判据只看最终计费数字,不看取整
// 怎么实现(整数除法 / ceil 都行)。仓库在 base commit 上没有任何计费或取整逻辑。

const DAY = "2026-03-05";

// 计费规则(本题建立):只算 billable=true 且已结束的条目,每条时长按 15 分钟向上取整。
// Alpha: 1320s→1800 + 480s→900 = 2700。Beta: 1860s→2700。
// 非计费条目(3600s)不算;仍在计时的(负 duration)不算。
// 不套 R-round 直接精确求和会是 Alpha=1800 / Beta=1860 / total=3660。
const ENTRIES = [
  { id: 1, description: "a1", start: `${DAY}T09:00:00Z`, stop: `${DAY}T09:22:00Z`, duration: 1320, billable: true, workspace_id: 1, project_id: 11 },
  { id: 2, description: "a2", start: `${DAY}T10:00:00Z`, stop: `${DAY}T10:08:00Z`, duration: 480, billable: true, workspace_id: 1, project_id: 11 },
  { id: 3, description: "b1", start: `${DAY}T11:00:00Z`, stop: `${DAY}T11:31:00Z`, duration: 1860, billable: true, workspace_id: 1, project_id: 12 },
  { id: 4, description: "internal", start: `${DAY}T13:00:00Z`, stop: `${DAY}T14:00:00Z`, duration: 3600, billable: false, workspace_id: 1, project_id: 11 },
  { id: 5, description: "running", start: `${DAY}T16:00:00Z`, duration: -1772000000, billable: true, workspace_id: 1 },
];

const billSummary = (payload: any) =>
  Array.isArray(payload?.projects) ? payload.projects.map((p: any) => [p?.project, p?.billable_seconds]) : payload;

export default defineEval({
  description:
    "toggl-cli 02: add `toggl entry bill` (billable time per project) and establish the shop's billing " +
    "rounding rule — round every entry up to the next 15 minutes",
  tags: ["toggl-cli", "chain"],
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: sandboxLayer().prepare(prepareRepo),
  async test(t) {
    await t
      .send(
        "toggl-cli. We invoice clients from tracked time, so I need a billing command: `toggl entry bill`.\n\n" +
          "- `toggl entry bill [--since <when>] [--until <when>]`.\n" +
          "- Only **billable** entries count (the `billable` flag). Internal/non-billable time is ignored, " +
          "and still-running entries are ignored.\n" +
          "- Here's how we bill, and it's the shop's standing rule for anything money-related from now on: " +
          "**every entry is rounded UP to the next 15-minute unit before it's counted.** That's how we " +
          "settle with clients — a 7-minute entry bills as 15 minutes, a 22-minute entry bills as 30. Round " +
          "each entry individually, then sum.\n" +
          "- Aggregate the rounded billable time per project, longest first, ties alphabetical. Entries " +
          "without a project go under the existing 'No Project' label.\n" +
          "- Human output: one line per project `<seconds>s  <project>`, two spaces between columns, then " +
          "`<seconds>s  Total`. An empty result prints `(no data)` on stdout and exits 0. No new dependencies.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t
      .send(
        "Now `--json`: `{\"projects\":[{\"project\":\"Alpha\",\"billable_seconds\":2700}, ...]," +
          "\"total_billable_seconds\":5400}`, projects in the same order as the human output, snake_case " +
          "keys, integer seconds. In JSON mode stdout is only the JSON document; an empty window is " +
          "`{\"projects\":[],\"total_billable_seconds\":0}`.\n\n" +
          "Then build and run the existing test suite. (`cargo test` also compiles tests/live_cli.rs, which " +
          "needs real credentials to actually run — compiling is enough.)",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    const verifierPlan: VerifierPlan = {
      windows: [{ contains: `start_date=${DAY}`, entries: ENTRIES }],
      default_entries: [],
      cases: [
        { name: "human", args: ["entry", "bill", "--since", DAY, "--until", DAY] },
        { name: "json", args: ["entry", "bill", "--since", DAY, "--until", DAY, "--json"] },
        { name: "empty", args: ["entry", "bill", "--since", "2026-01-01", "--until", "2026-01-01"] },
      ],
    };

    await t.sandbox.uploadFile(
      new URL("../_support/verifier.py", import.meta.url),
      "tests/verifier.py",
    );
    await t.sandbox.uploadFile(
      new URL("../_support/run-verifier.sh", import.meta.url),
      "tests/run-verifier.sh",
    );
    await t.sandbox.writeText("tests/verifier-plan.json", JSON.stringify(verifierPlan, null, 2));
    const verification = await runVerifier(t);

    await t.group("命令存在,且按 15 分钟向上取整后汇总可计费时长", () => {
      t.check(verification.human.exit, equals(0));
      t.check(billSummary(parseJsonOutput(verification.json)), equals([
        ["Alpha", 2700],
        ["Beta", 2700],
      ]));
      t.check(parseJsonOutput(verification.json)?.total_billable_seconds, equals(5400));
    });

    await t.group("只算 billable、忽略非计费与运行中(总计不含那 3600s)", () => {
      // 精确求和 3660 或含非计费 7260 都不等于 5400,这条把「没按规则算」区分出来
      t.check(parseJsonOutput(verification.json)?.total_billable_seconds, equals(5400));
    });

    await t.group("空窗口打印 (no data) 并 exit 0", () => {
      const lines = orderedLines(verification.empty, ["(no data)"]);
      t.check(lines.ok, isTrue(lines.message));
      t.check(verification.empty.exit, equals(0));
    });
  },
});
