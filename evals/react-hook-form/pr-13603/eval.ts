import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../fixture.ts";

// 挖自真实合入 PR react-hook-form/react-hook-form#13603(不让被测 agent 看到 PR 号/commit/URL):
// useController 里 field 的写路径(onChange/onBlur)通过 useRef 只捕获一次 control.register()
// 的返回值,`control` prop 运行期切换后读路径(useWatch)已经重新订阅了新 control,写路径却还在
// 往旧 control 上写。真实修复只改了 src/useController.ts 一行(把 register 调用的返回值存回
// _registerProps.current,挪到已经会随 control 变化重跑的 effect 里),隐藏测试见 fixtures。

const BASE_COMMIT = "a4f380249f12856feef787103f84f714ca84c98d";

export default defineEval({
  description:
    "react-hook-form pr-13603: useController keeps writing field updates to the old control after the control prop changes at runtime (real react-hook-form issue)",
  diff: { ignore: ["coverage", "node_modules", ".niceeval-clone"] },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-hook-form repository at the commit where the bug below " +
          "reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: `useController` has a bug where, when the `control` object passed to it changes at runtime (the " +
          "surrounding component re-renders with a different `control` prop, without unmounting), field *reads* " +
          "correctly switch over to the new control (`field.value` reflects the new control's state), but field " +
          "*writes* do not — calling the returned `field.onChange` (or `field.onBlur`) after the control prop has " +
          "changed still updates the OLD control's form state instead of the new one's. For example: render " +
          "`useController({ control: formA.control, name: 'name' })`, call `field.onChange('typed-in-a')` (formA " +
          "correctly gets `'typed-in-a'`), then re-render the same hook with `control: formB.control` (no unmount). " +
          "`field.value` correctly flips to formB's value, but calling `field.onChange('typed-in-b')` at this point " +
          "still writes to formA instead of formB. Reads and writes have gotten out of sync after a control switch. " +
          "Fix the library source under `src/` so writes always target whichever control is currently active, " +
          "matching what reads already do.\n\n" +
          "Environment notes: dependencies are already installed (via `npm install -g pnpm@10.34.5 && CYPRESS_INSTALL_BINARY=0 " +
          "pnpm install --no-frozen-lockfile --ignore-scripts`). Run the relevant tests with `node_modules/.bin/jest --config " +
          "./scripts/jest/jest.config.js src/__tests__/useController.test.tsx`. Fix the library source; do not just " +
          "edit tests.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    // 真实仓库路径:覆盖掉 agent 可能留下的任何版本,判分对齐上游隐藏测试。
    await t.sandbox.uploadFile(
      new URL("tests/useController.test.tsx", import.meta.url),
      "src/__tests__/useController.test.tsx",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
