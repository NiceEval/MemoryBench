import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// real fix: react-tooltip PR #1282 (merge 5bc1fe6ad7a42defa1a5ae05b953641f5b2dc227),
// which lands on top of BASE_COMMIT (its first parent, == baseRefOid here). Bug: the
// global delegated-event listener setup never attached a `touchstart` handler for the
// hover-style open events (mouseenter/mouseover/focus), so touch taps on an anchor
// never opened the tooltip on touch-only devices; separately, the scroll/resize
// global-close handler cleared the tooltip's visible state but didn't clear the
// pending show-delay timer, so a show that was already in flight when scroll/resize
// fired could still land afterwards and make the tooltip reappear.
const BASE_COMMIT = "1099ad1a619ef12ca872ab755372af29928e1848";

export default defineEval({
  description:
    "react-tooltip pr-1282: support touch-based tooltip opening and stop a pending show from reopening a " +
    "tooltip closed by scroll/resize (real react-tooltip issue)",
  // 纯 Node 仓库,不用 Dockerfile/apt;install+单文件 jest 本地实测数十秒,默认 600s 够用。
  // yarn.lock 在本仓库现状下本来就跟 package.json 的 caret range 对不上(--frozen-lockfile
  // 直接报错),任何一次 `yarn install`(不管 agent 有没有改代码)都会把它重写成实际解析到
  // 的版本——这是安装期噪音,不是 agent 的改动,故忽略。
  diff: {
    ignore: ["coverage", "node_modules", "yarn.lock", ".niceeval-clone"],
  },
  plugins: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-tooltip repository at the commit where the bugs " +
          "below reproduce. Find and fix the bugs in the library source.\n\n" +
          "Bug 1 (touch devices): react-tooltip supports a `touch` open behavior alongside mouse/focus hover, but " +
          "on touch-only devices tapping an anchor never opens the tooltip at all when the tooltip is configured " +
          "to open on hover-style events (mouseenter/mouseover/focus). The component sets up its global, " +
          "delegated event listeners once per anchor-selector configuration, and this setup path only attaches " +
          "handlers for the mouse/focus events it's configured to open on — there is no corresponding `touchstart` " +
          "handler wired into that same delegated listener setup, so a tap produces no `mouseenter`/`mouseover`/" +
          "`focus` and the tooltip never shows.\n\n" +
          "Bug 2 (reappearing after scroll/resize close): a tooltip can be configured to close automatically when " +
          "the page scrolls or the window resizes. If the user opens the tooltip (which schedules the tooltip to " +
          "show after a configurable show-delay) and a scroll or resize event fires while that show is still " +
          "pending — i.e. before the delayed show has actually applied — the scroll/resize handler hides the " +
          "tooltip, but the previously scheduled show is not cancelled. That pending show still fires afterward " +
          "and makes the tooltip reappear even though the user's scroll/resize should have kept it closed. " +
          "Expected: once scroll or resize closes a tooltip, no show that was already in flight before that " +
          "close should be allowed to reopen it after the fact.\n\n" +
          "Environment notes: dependencies are already installed (Node, yarn classic v1). You can scope the " +
          "existing Jest suite to whatever file you're iterating on with `npx jest <path-to-file>`. Fix the " +
          "library source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/tooltip-anchor-selection.spec.js", import.meta.url),

      "src/test/tooltip-anchor-selection.spec.js",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
