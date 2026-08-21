import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// real fix: react-hook-form PR #13566 (merge f89388f5f60b8a8222a42b340f49b38e77d9ed26),
// which lands on top of BASE_COMMIT (its first parent). Bug: flatten() recurses into
// any non-null object-typed field value, including Date instances, instead of keeping
// Date as a single leaf value.
const BASE_COMMIT = "46381fa8fe690fc16d17afde8a43738a55b2c6e6";

export default defineEval({
  description:
    "react-hook-form pr-13566: preserve Date values as leaf nodes in the flatten() utility (real react-hook-form issue)",
  // 装依赖只有 pnpm install,本地实测全程 < 1 分钟,scoped jest 跑单文件 < 2s;沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-hook-form repository at the commit where the bug " +
          "below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: react-hook-form has an internal `flatten` utility that turns a nested form values object into a flat " +
          "map of dot-separated paths to leaf values (used internally for things like path-based dirty/touched " +
          "diffing). It decides whether to recurse into a value purely by checking whether the value is a non-null " +
          "object — it has no special case for `Date` instances. So when a field's value is a `Date`, `flatten` " +
          "treats it as a plain container and tries to recurse into it. A `Date` instance has no own enumerable " +
          "properties, so this recursion produces nothing, and the field silently disappears from the flattened " +
          "output instead of being kept as a single leaf value holding the original `Date`. For example, " +
          "`flatten({ name: 'Alice', createdAt: new Date('2024-01-01'), age: 30 })` should return an object with a " +
          "`createdAt` key holding that same `Date`, but the key is missing from the result entirely. The same " +
          "thing happens when the `Date` is nested inside another object, e.g. a `range: { start, end }` field " +
          "with `Date` values should flatten to `range.start` / `range.end` keys holding those `Date`s, but those " +
          "keys go missing too.\n\n" +
          "Environment notes: dependencies are already installed (Node, pnpm). You can scope the existing Jest " +
          "suite to whatever file you're iterating on with `node_modules/.bin/jest --config " +
          "./scripts/jest/jest.config.js <path-to-file>`. Fix the library source; do not just add workarounds in " +
          "test files.",
      )
      .then((turn) => turn.succeeded().orStop());

    await t.sandbox.uploadFile(

      new URL("tests/flatten.test.ts", import.meta.url),

      "src/__tests__/utils/flatten.test.ts",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
