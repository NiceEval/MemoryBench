import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// real fix: downshift PR #1603 (squash-merge ee2a828ac70035c1e6156523b72c11abae4c07e4,
// a single-parent commit whose parent equals BASE_COMMIT below). Bug: getItemProps() in
// both src/hooks/useCombobox/index.js and src/hooks/useSelect/index.js builds
// `aria-selected` via a template-string interpolation of the boolean comparison
// (`` `${cond}` ``), so it returns the *string* "true"/"false" instead of a real boolean,
// even though the documented/typed return value is boolean.
const BASE_COMMIT = "4bf894ba355f8c281bf4cea98fc32d01fbc3f8d7";

export default defineEval({
  description:
    "downshift pr-1603: return a real boolean (not a stringified boolean) for aria-selected from useCombobox/useSelect (real downshift issue)",
  // 装依赖只有 npm install(无锁文件,.npmrc 设 package-lock=false),本地实测 install ~2 分钟,
  // scoped jest 跑两个文件 < 2s;沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real downshift repository at the commit where the bug below " +
          "reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: both the `useCombobox` and `useSelect` hooks return an `aria-selected` prop from their " +
          "`getItemProps()` function for each list item, and this prop is documented/typed as a plain boolean " +
          "(`true` or `false`). In practice, the value that comes back is not a real boolean at all — it's the " +
          "*string* `\"true\"` or `\"false\"` instead. So `itemProps['aria-selected']` is truthy in both cases " +
          "(even the 'not selected' case is a non-empty string), and any code or test that does a strict " +
          "comparison — `itemProps['aria-selected'] === true`, `itemProps['aria-selected'] === false`, or a deep-" +
          "equality assertion like `expect(itemProps['aria-selected']).toEqual(true)` — gets the wrong answer, " +
          "even though the item's highlighted/selected state itself is being computed correctly. For example, " +
          "for an item that IS currently highlighted (in `useCombobox`) or selected (in `useSelect`), " +
          "`getItemProps()` should return `aria-selected: true` (the boolean), not `aria-selected: \"true\"` (the " +
          "string) — and likewise it should return the boolean `false`, not the string `\"false\"`, for an item " +
          "that is not. Fix both hooks so `getItemProps()` always hands back a real boolean for `aria-selected`, " +
          "matching the documented type. (Rendered DOM markup like `aria-selected=\"true\"` is unaffected by this " +
          "bug and unaffected by the fix — this is purely about the type of the value in the JS props object " +
          "returned by `getItemProps()`.)\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Jest " +
          "suite to whatever file you're iterating on with `npx kcd-scripts test --no-watch <path-to-file>`. Fix " +
          "the library source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().orStop());

    await t.sandbox.uploadFile(

      new URL("tests/useCombobox-getItemProps.test.js", import.meta.url),

      "src/hooks/useCombobox/__tests__/getItemProps.test.js",

    );
    await t.sandbox.uploadFile(
      new URL("tests/useSelect-getItemProps.test.js", import.meta.url),
      "src/hooks/useSelect/__tests__/getItemProps.test.js",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
