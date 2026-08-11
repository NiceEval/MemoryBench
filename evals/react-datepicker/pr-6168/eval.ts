import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// react-datepicker#6168 (https://github.com/Hacker0x01/react-datepicker/pull/6168):
// Safari's page auto-translate feature mutates the DOM of the open calendar popup,
// which fights React's reconciliation of the same nodes and corrupts/breaks the
// calendar. Fix adds translate="no" to the calendar dialog element in
// src/calendar_container.tsx. base_sha below is the merge commit's direct first
// parent (more precise than the PR's baseRefOid, which is an older ancestor since
// main advanced past the PR's branch point before merge -- normal, not a discrepancy).
const BASE_COMMIT = "6667a40d339d8fb5a6c02263b08d366cf2cfc449";

export default defineEval({
  description:
    "react-datepicker pr-6168: calendar dialog must opt out of browser auto-translation so Safari's translate feature doesn't corrupt it (real react-datepicker issue)",
  // 纯 Node 仓库,yarn install + 单文件 jest 本地验证都在数秒到数十秒量级,用默认 timeout 即可。
  diff: {
    ignore: ["coverage", "node_modules", "package.json", ".niceeval-clone"],
  },
  plugins: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-datepicker repository at the commit where the " +
          "bug below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: Safari has a built-in \"Translate this page\" feature. When a user has it enabled (or triggers it " +
          "manually) while the datepicker's calendar popup is open, Safari's translation pass walks the DOM and " +
          "rewrites text nodes inside whatever is currently on screen -- including the open calendar dialog. That " +
          "DOM rewrite fights with React's own reconciliation of the same nodes: users report the calendar " +
          "breaking, freezing, or throwing errors on any interaction (clicking a day, changing month, etc.) once " +
          "the page has been auto-translated by Safari while the calendar was open.\n\n" +
          "The calendar popup is exactly the kind of live, interactive, non-prose UI that should never be " +
          "rewritten by a browser's page-translation pass -- unlike static article text, mutating it out from " +
          "under React corrupts the widget. Browsers support an opt-out for this on a per-element basis; the " +
          "calendar dialog element should use it so Safari (and other browsers with similar auto-translate " +
          "features) leaves the calendar's DOM alone entirely.\n\n" +
          "Fix the library source so the rendered calendar dialog element opts out of browser auto-translation. " +
          "Do not just add a workaround in a test file -- change the actual component that renders the calendar " +
          "dialog.\n\n" +
          "Environment notes: package manager is Yarn (Berry, via corepack) -- already installed and " +
          "`yarn install --immutable` already run for you. Existing tests can be run as a regression check with " +
          "`NODE_ENV=test yarn test` (or `NODE_ENV=test node_modules/.bin/jest` to run the whole suite directly). " +
          "This is a TypeScript + React codebase; the calendar dialog markup lives under `src/`.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/calendar_container.test.tsx", import.meta.url),

      "src/test/calendar_container.test.tsx",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
