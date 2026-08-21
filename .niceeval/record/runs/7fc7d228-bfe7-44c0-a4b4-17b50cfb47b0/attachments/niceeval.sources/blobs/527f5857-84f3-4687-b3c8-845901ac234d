import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// real fix: yet-another-react-lightbox PR #408 (squash-merged as
// 2861732969a182075ba19d3a001b34c3a38a3081), which lands on top of BASE_COMMIT (its first
// parent -- this was a squash merge, so the merge commit itself has exactly one parent, and
// that parent is an ancestor of the PR's baseRefOid, which had gone stale by the time this
// merged). Feature: the Zoom plugin only ever wrapped image slides (isImageSlide(slide)) in
// its interactive zoom container -- any other slide `type` (custom render functions, video,
// etc.) silently got no zoom support at all, with no way to opt in. The fix adds a `supports`
// list (of slide `type` strings) and a `maxZoom` prop (number, or a function of the slide
// returning a number | undefined, defaulting to 8) to the Zoom plugin's options so custom
// slide types can opt into the same zoom wrapper/gesture handling that image slides get.
const BASE_COMMIT = "c1c704426607e3eaceb1b1d7794df1235e4adf8a";

// this base commit's dependency tree (vite@^8 / vitest@^4.1 / jsdom@^29) needs Node >= 20.19
// / >= 22.12 (vite's rolldown dependency imports `util.styleText`, which doesn't exist before
// Node 20.12, and jsdom declares `engines.node: ^20.19.0 || ^22.13.0 || >=24.0.0`) -- the
// sandbox's default Node (20.9.0) installs fine but throws a SyntaxError on `node:util` the
// moment vitest starts up. Confirmed locally: identical failure on the *unmodified* pre-fix
// Zoom.spec.ts under Node 20.9.0, and a clean RED (2 fail / 2 pass) -> GREEN (4 pass) under
// Node 20.19.0 and Node 22.13.0 alike. So install bumps the sandbox's global Node to 22.13.0
// via `n` before `npm install`, with a fail-fast version assertion in between so a
// PATH-precedence surprise in the real sandbox (untested there -- only verified locally on
// darwin-arm64, mirroring the same workaround already used by the commit-5578052 eval in this
// same repo) fails loudly here instead of silently leaving the agent-under-test on 20.9.0,
// unable to run its own tests.
export default defineEval({
  description:
    "yet-another-react-lightbox pr-408: let the Zoom plugin opt custom slide types into zoom via supports/maxZoom props (real yet-another-react-lightbox issue)",
  // 纯 npm 仓库,无 packageManager 字段(不用 corepack);package-lock.json 提交在根目录。
  // Node 换成 22.13 后本地实测 npm install 数秒,vitest 跑单文件 <2s;沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: prepareRepo(BASE_COMMIT),

  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real yet-another-react-lightbox repository at the commit " +
          "where the feature gap below needs closing. Implement the feature in the library source.\n\n" +
          "Context: this library renders a photo/video lightbox carousel. It ships a Zoom plugin that adds " +
          "pinch/scroll/double-click zoom interactions to the currently displayed slide. Right now the Zoom " +
          "plugin only ever recognizes image slides -- internally it decides whether to wrap a slide in its " +
          "interactive zoom container purely by checking whether that slide is an image slide, with no way to " +
          "opt any other kind of slide into zoom. Consumers can render arbitrary custom slide types through the " +
          "lightbox's `render.slide` render-prop (keyed by a slide's `type` field, e.g. a custom map view, a " +
          "video player, a PDF page, etc.), but none of those custom slide types can ever get zoom behavior, no " +
          "matter what the consumer configures -- the plugin just renders them completely unwrapped, with no " +
          "zoom UI, no pinch/scroll/double-click handling, nothing.\n\n" +
          "Feature request: add a way for a consumer to opt specific custom slide types into the same zoom " +
          "wrapper/gesture handling that image slides already get. Concretely, the Zoom plugin's options object " +
          "(the `zoom` prop passed to the lightbox) should grow two new optional properties:\n\n" +
          "- `supports`: a list of slide `type` strings. When the currently displayed slide's `type` is included " +
          "in this list, the plugin should wrap it in the same interactive zoom container an image slide gets " +
          "(so it participates in zoom in/out, pinch, scroll-to-zoom, double-click/double-tap, etc., exactly " +
          "like an image slide does) -- even though the slide itself isn't an image slide. A slide whose `type` " +
          "is not image and not listed in `supports` (or when `supports` is not configured at all) should " +
          "continue to render completely unwrapped, exactly as today.\n\n" +
          "- `maxZoom`: controls how far a non-image slide can be zoomed in. For image slides the maximum zoom " +
          "level is already computed automatically from the image's natural resolution vs. its displayed size, " +
          "but that computation is meaningless for a non-image custom slide (there's no natural image resolution " +
          "to compare against), so it needs its own configurable ceiling. `maxZoom` may be a plain number, or a " +
          "function that receives the current slide and returns either a number or `undefined`; returning " +
          "`undefined` (or omitting `maxZoom` entirely) should fall back to a sensible default maximum zoom " +
          "level of 8x. This setting only affects non-image slides -- image slides keep using their existing " +
          "resolution-based maximum zoom calculation unchanged.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Vitest " +
          "suite to whatever file you're iterating on with `npx vitest run <path-to-file>`. Implement the " +
          "feature in the library source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().orStop());

    await t.sandbox.uploadFile(

      new URL("tests/Zoom.spec.ts", import.meta.url),

      "test/unit/plugins/Zoom.spec.ts",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
