import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// 挖自真实合入 PR react-hook-form/react-hook-form#13594(修复 issue #13592;不让被测 agent 看到
// PR 号/commit)。Bug:表单以 `disabled: true` 创建时,`createFormControl.ts` 里更新脏状态的
// 分支把「表单被禁用」直接当成「不追踪 dirty」,于是显式的 `setValue(name, v, { shouldDirty: true })`
// 也被吞掉,字段/表单都不标脏;真实修复区分了「用户交互触发的隐式 dirty(禁用时仍不追踪)」与
// 「调用方显式请求的 dirty(即便禁用也要兑现)」,只动 createFormControl.ts 一处逻辑。
// 隐藏测试是 formState.test.tsx 里新增的两个用例(设脏 + 复位清脏两个方向),base_sha 下必失败
// (2 failed / 35 passed),打上真实修复后 37 全绿——本地 Node 20.9.0 双向验证过。
const BASE_COMMIT = "65599cce839bfdf5c90017de2d1e44da98754beb";

export default defineEval({
  description:
    "react-hook-form pr-13594: on a disabled form, setValue(..., { shouldDirty: true }) must still mark the " +
    "field and form dirty (an explicit programmatic dirty request), while ordinary interaction on a disabled " +
    "form stays non-dirty (real react-hook-form issue #13592)",
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-hook-form repository at the commit where the " +
          "bug below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: when a form is created in the disabled state (`useForm({ disabled: true })`), calling " +
          "`setValue(name, value, { shouldDirty: true })` fails to mark anything dirty. After registering a " +
          "field and then programmatically setting a value that differs from its default with " +
          "`shouldDirty: true`, `getFieldState(name).isDirty`, `formState.isDirty`, and `formState.dirtyFields` " +
          "all incorrectly stay in their pristine state — even though the new value clearly differs from the " +
          "default. Conversely, programmatically setting the field back to its default value on a disabled form " +
          "should clear that dirty state again. The root cause is that the dirty-tracking path treats a disabled " +
          "form as 'never track dirtiness' and swallows the update entirely. The correct behavior is that an " +
          "explicit programmatic dirty request (`setValue` with `shouldDirty: true`) is honored even while the " +
          "form is disabled, while ordinary user interaction (typing/blur) on a disabled form still does NOT " +
          "track dirtiness. Fix the library source (under `src/`); do not just add workarounds in test files.\n\n" +
          "Environment notes: dependencies are already installed (via `npm install -g pnpm@10.34.5 && " +
          "CYPRESS_INSTALL_BINARY=0 pnpm install --no-frozen-lockfile --ignore-scripts`). Run tests with " +
          "`node_modules/.bin/jest --config ./scripts/jest/jest.config.js src/__tests__/useForm/formState.test.tsx`.",
      )
      .then((turn) => turn.succeeded().orStop());

    // 真实仓库路径:覆盖掉 agent 可能留下的任何版本,判分对齐上游隐藏测试。
    await t.sandbox.uploadFile(
      new URL("tests/formState.test.tsx", import.meta.url),
      "src/__tests__/useForm/formState.test.tsx",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
