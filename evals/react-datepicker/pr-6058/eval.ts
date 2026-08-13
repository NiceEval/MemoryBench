import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// PR #6058 (Hacker0x01/react-datepicker), merged as 928b2cf5b7fb2ed70798dc280568c22de040fbd4;
// base_sha below == that merge commit's first parent (verified: `git merge-base --is-ancestor`
// and direct oid equality against `gh pr view --json baseRefOid`).
const BASE_COMMIT = "bd3ab113a4d5b6f092017e54d29b7678195c9613";

export default defineEval({
  description:
    "react-datepicker pr-6058: changeMonth from a custom header doesn't reset monthSelectedIn back to the first panel with monthsShown=2 (real react-datepicker issue)",
  // 纯 Node 仓库,不用 Dockerfile/apt;install+单文件 jest 本地实测数十秒,默认 600s 够用。
  diff: {
    ignore: ["coverage", "node_modules", "package.json", ".niceeval-clone"],
  },
  sandbox: prepareRepo(BASE_COMMIT),

  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-datepicker repository at the commit where the " +
          "bug below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: when a `DatePicker` is rendered with `monthsShown={2}` and a `renderCustomHeader` render prop, the " +
          "component internally tracks which of the two visible month panels the user most recently picked a day " +
          "in. Once the user clicks a day inside the second (rightmost) panel, that tracked panel index gets " +
          "stuck: if the user then uses the custom header's own month-jump control (i.e. calls the `changeMonth` " +
          "callback that `renderCustomHeader` receives) to navigate to a different month, the newly selected " +
          "month renders starting in the second panel instead of the first, and every subsequent `changeMonth` " +
          "call from the custom header keeps landing in the wrong panel until the component remounts or a day is " +
          "clicked back in the first panel. Expected: calling the custom header's `changeMonth` callback should " +
          "always place the target month in the first (leftmost) panel, regardless of which panel the user's most " +
          "recent day-selection came from.\n\n" +
          "Environment notes: package manager is yarn (yarn@4.9.2, already installed via corepack). Run a single " +
          "test file with `node_modules/.bin/jest <path-to-file>` (or `yarn test <path-to-file>`). Fix the " +
          "library source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().orStop());

    await t.sandbox.uploadFile(

      new URL("tests/datepicker_test.test.tsx", import.meta.url),

      "src/test/datepicker_test.test.tsx",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
