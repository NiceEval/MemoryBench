import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../fixture.ts";

// real fix: direct commit 557805264799d436f8dae40414faf3318b468954 to
// igordanchenko/yet-another-react-lightbox main (no associated PR — confirmed via
// `gh api repos/.../commits/<sha>/pulls` returning []), which lands on top of
// BASE_COMMIT (its first parent). Bug: LightboxRoot detected RTL direction only once,
// via a ref callback that ran at initial mount (`getComputedStyle(node).direction`).
// If the page's `dir` (or whatever controls computed direction) changed after mount,
// the lightbox kept using the direction it detected at mount and never re-checked.
const BASE_COMMIT = "3ae28d1fca631f7dc31fc9d56a9c43551f9afd21";

// base commit sits right after this repo's dev-deps were bumped (jsdom 29 / vite 7 /
// html-encoding-sniffer 6, which all declare `engines.node` >= 20.19 / >= 22.12) — the
// sandbox's default Node (20.9.0) can install these fine but throws ERR_REQUIRE_ESM
// (and then a fake-timer hook timeout that cascades into every test) the moment jsdom
// is actually instantiated. Confirmed locally: identical failure on the *unmodified*
// pre-fix RTL.spec.ts under Node 20.9.0, and a clean 10-pass/11-pass RED→GREEN under
// Node 22.13.0. So install bumps the sandbox's global Node to 22.13.0 via `n` before
// `npm install`, with a fail-fast version assertion in between so a PATH-precedence
// surprise in the real sandbox (untested there — only verified locally on darwin-arm64)
// fails loudly here instead of silently leaving the agent-under-test on 20.9.0, unable
// to run its own tests.
export default defineEval({
  description:
    "yet-another-react-lightbox commit-5578052: re-detect RTL direction on every render instead of only at mount (real yet-another-react-lightbox issue)",
  // 纯 npm 仓库,无 packageManager 字段(不用 corepack);package-lock.json 提交在根目录。
  // 本地实测(Node 22.13 后)npm install 数秒,vitest 跑单文件 <1s;沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real yet-another-react-lightbox repository at the commit " +
          "where the bug below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: this library's root component figures out whether the page/container it is rendered into uses " +
          "right-to-left (RTL) text direction, and uses that to decide things like which arrow key means " +
          "'next slide'. It detects the direction by reading the computed CSS `direction` of its own root " +
          "element (via `getComputedStyle`). The problem is that this detection only ever runs once, at the " +
          "moment the lightbox's root element is first attached to the DOM — the result is then cached in " +
          "component state for the lifetime of that mount and never rechecked. So when the direction changes " +
          "while the lightbox stays mounted — for example the application re-renders the still-mounted " +
          "lightbox with a different `dir` on its container, switching it from `ltr` to `rtl` — the lightbox " +
          "does not notice. It keeps behaving as if the direction were still whatever it detected at mount " +
          "time (e.g. arrow keys keep working in the old direction's sense) instead of picking up the new, " +
          "current direction. The direction must stay correct in both directions of change (ltr→rtl and " +
          "rtl→ltr), for as long as the component remains mounted.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Vitest " +
          "suite to whatever file you're iterating on with `npx vitest run <path-to-file>`. Fix the library " +
          "source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/RTL.spec.ts", import.meta.url),

      "test/unit/RTL.spec.ts",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
