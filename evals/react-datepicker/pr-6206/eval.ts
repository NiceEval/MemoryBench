import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// 挖自 react-datepicker PR #6206(修复 GitHub issue #6193),base commit 是该 PR 的
// baseRefOid,merge commit 3d53acb06b7374bbf4d4d496a7871b656da7115e 提供隐藏测试的
// 权威 post-fix 内容。这两个标识符只出现在代码注释里——被测 agent 永远看不到。
const BASE_COMMIT = "e1ce24549f030bd159829dbbad077abe1b60cb52";

export default defineEval({
  description:
    "react-datepicker PR #6206: fix DatePicker's day-click / input-display / selectsMultiple all going off-by-one-day when the explicit timeZone prop differs from the local timezone (real GitHub issue #6193)",
  // 纯 Node/TS 仓库,没有编译产物散落进源码树的问题;node_modules/coverage 是测试期间
  // 产生的噪音,不该算进 agent 的归因 diff。
  diff: {
    ignore: ["coverage", "node_modules", "package.json", ".niceeval-clone"],
  },
  plugins: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-datepicker repository (a React date-picker " +
          "component library) at the commit where the bug below reproduces. Find and fix the bug in the library " +
          "source.\n\n" +
          "Bug: `DatePicker` accepts an explicit `timeZone` prop (an IANA zone name such as " +
          '"Pacific/Kiritimati") meant to pin the picker to a timezone different from the browser\'s local ' +
          "timezone. When that `timeZone` differs significantly from the local/browser timezone, the picker " +
          "gets the calendar day wrong in three places: (1) clicking a day in the calendar grid produces an " +
          "`onChange` date, and a visually 'selected' day, that are off by one day (in the configured timeZone) " +
          "from the day the user actually clicked; (2) the formatted value shown in the text input is off by " +
          "one day because it reflects UTC/browser-local time instead of the configured timeZone; (3) with " +
          "`selectsMultiple`, the calendar does not consistently highlight the correct set of days as selected " +
          "in the target timezone. In short, calendar day-highlighting, the input's formatted display value, " +
          "and multi-date-selection highlighting must all consistently interpret `selected` / `startDate` / " +
          "`endDate` / `selectedDates` (and the values handed to `onChange`) in terms of the configured " +
          "`timeZone`, not the browser's local timezone. Fix the library source (under `src/`); do not just " +
          "add workarounds in test files.\n\n" +
          "Environment notes: this is a Node/TypeScript project managed with Yarn (Berry) via Corepack; " +
          "dependencies are already installed (re-run `corepack enable && yarn install --immutable` if you " +
          "ever need to). Tests use Jest — run a single file with `node_modules/.bin/jest <path>`.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/timezone_test.test.tsx", import.meta.url),

      "src/test/timezone_test.test.tsx",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
