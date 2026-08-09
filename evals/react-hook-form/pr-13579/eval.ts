import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../harness.ts";

// 挖自真实合入 PR react-hook-form/react-hook-form#13579(修复 issue #13575;不让被测 agent 看到
// PR 号/commit)。Bug:`form.subscribe({ formState, callback })` 的回调 payload 会带上触发该次
// 通知的字段 `name`。`createFormControl.ts` 把单次事件的元数据(name/type)持久化进了 form state,
// 于是先 `clearErrors('firstName')` 之后,再触发一次与该字段无关的更新(如提交),订阅回调仍拿到
// 上次遗留的 `name: 'firstName'` 而不是 `undefined`——事件元数据跨通知泄漏。真实修复让 per-event
// 元数据不再被写进持久 state。隐藏测试是 subscribe.test.tsx 里新增的一个用例,base_sha 下必失败
// (1 failed / 13 passed),打上真实修复后 14 全绿——本地 Node 20.9.0 双向验证过。
const BASE_COMMIT = "cae5dfe2d60f1f19e2d9e40314ddef858064347f";

export default defineEval({
  description:
    "react-hook-form pr-13579: per-event metadata (the field `name`) leaks across subscribe() notifications — a " +
    "later, unrelated update reports a stale `name` from an earlier clearErrors() call instead of undefined " +
    "(real react-hook-form issue #13575)",
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-hook-form repository at the commit where the " +
          "bug below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: a subscription created via `form.subscribe({ formState: { ... }, callback })` receives a payload " +
          "that includes the `name` of the field involved in the event that triggered it. If you call " +
          "`clearErrors('firstName')` and then, later, trigger an unrelated form-state update that has no field " +
          "name of its own (for example submitting the form via `handleSubmit`), the subscriber's callback " +
          "fires with `name` still set to `'firstName'` — a stale value left over from the earlier " +
          "`clearErrors` call — instead of `undefined`. In other words, the per-event metadata (`name`/`type`) " +
          "from one notification is being persisted into form state and bleeding into later, unrelated " +
          "notifications. Fix the library source so that per-event metadata is not persisted across updates and " +
          "each subscriber notification reports only the name (if any) of the event that actually triggered it. " +
          "Fix the library source (under `src/`); do not just add workarounds in test files.\n\n" +
          "Environment notes: dependencies are already installed (via `npm install -g pnpm@10.34.5 && " +
          "CYPRESS_INSTALL_BINARY=0 pnpm install --no-frozen-lockfile --ignore-scripts`). Run tests with " +
          "`node_modules/.bin/jest --config ./scripts/jest/jest.config.js src/__tests__/useForm/subscribe.test.tsx`.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    // 真实仓库路径:覆盖掉 agent 可能留下的任何版本,判分对齐上游隐藏测试。
    await t.sandbox.uploadFile(
      new URL("tests/subscribe.test.tsx", import.meta.url),
      "src/__tests__/useForm/subscribe.test.tsx",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
