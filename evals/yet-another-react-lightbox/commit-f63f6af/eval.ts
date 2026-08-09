import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../harness.ts";

// real fix: direct commit f63f6af90a2e0d70fe04a126001076151178eb78 to
// igordanchenko/yet-another-react-lightbox main (no associated PR — confirmed via
// `gh api repos/.../commits/<sha>/pulls` returning []), which lands on top of
// BASE_COMMIT (its first parent). Bug: the thumbnails plugin computed its preload
// window the same way regardless of carousel.finite, so in finite (non-looping) mode
// the thumbnail strip showed the wrong number of thumbnails and misplaced them near
// the start/end edges compared to the default infinite/looping mode.
const BASE_COMMIT = "c0ec3709403a357b7c9e8a95f2645cf6bd808262";

export default defineEval({
  description:
    "yet-another-react-lightbox commit-f63f6af: fix thumbnail strip count/positioning in finite carousel mode (real yet-another-react-lightbox issue)",
  // 纯 npm 仓库,无 packageManager 字段(不用 corepack);package-lock.json 提交在根目录。
  // 本地实测 npm install 数秒,vitest 跑单文件 <2s;沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real yet-another-react-lightbox repository at the commit " +
          "where the bug below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: this library renders a photo/video lightbox with an optional thumbnails plugin that shows a " +
          "strip of thumbnail images alongside the main carousel. The lightbox has a `carousel.finite` option: " +
          "when it is false (the default), the carousel loops/wraps around infinitely; when it is true, the " +
          "carousel is finite and does not wrap — navigating past the last slide or before the first slide is " +
          "not possible. The thumbnail strip is supposed to show a window of thumbnails around the current " +
          "slide, sized according to the carousel's `preload` setting — but the windowing rule near the edges " +
          "necessarily differs between the two modes, since infinite mode can wrap slides in from the other end " +
          "while finite mode cannot. In practice, when `carousel.finite` is true, the thumbnail strip's own edge " +
          "windowing is broken: it renders the wrong number of real thumbnails and/or misplaces them near the " +
          "start and end of the slide sequence, i.e. it does not correctly compute how many real (non-wrapped) " +
          "thumbnails should be visible in a non-wrapping window near an edge. This is specifically a finite-mode " +
          "bug — the default infinite/looping mode already computes its own (wrap-aware) edge window correctly; " +
          "the two modes are not expected to produce identical counts, since their windowing rules genuinely " +
          "differ, but finite mode's counts/positions should be internally correct for a non-wrapping window, " +
          "which right now they are not.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Vitest " +
          "suite to whatever file you're iterating on with `npx vitest run <path-to-file>`. Fix the library " +
          "source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/Thumbnails.spec.ts", import.meta.url),

      "test/unit/plugins/Thumbnails.spec.ts",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
