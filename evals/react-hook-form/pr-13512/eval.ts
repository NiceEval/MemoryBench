import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// 挖自真实合入 PR react-hook-form/react-hook-form#13512(不让被测 agent 看到 PR 号/commit/URL):
// validateField.ts 里给 shouldUseNativeValidation 用的 setCustomValidity 闭包只对
// `inputRef`(取自 `refs ? refs[0] : ref`,即多 ref 字段——单选框组共享同一个 name 时的第一个
// ref)调用 setCustomValidity()/reportValidity(),同一字段名下的其余 radio ref 从未被设置过原生
// validity,导致浏览器原生校验气泡只锚定在组里的第一个单选按钮上。真实修复只动了这一处:message
// 消息本身照旧算,但当 `refs` 存在(多 ref 字段)时改成对 `refs.forEach()` 逐个调用
// `setCustomValidity()`,没有 refs 时才退回原来单 `inputRef` 分支。
// 隐藏测试是新增的两个用例(validateField.test.tsx 里的 "with Browser native validation"
// describe 块下),覆盖设置和清除两个方向;本地验证过 base_sha 下这两个用例必然失败(2 failed /
// 20 passed),打上真实修复后 22 全绿。
//
// 2026-07-24 修正(原判据在考实现而不是考功能,ALT 会被误杀):最初直接搬上游用例,组内第二个
// radio ref 的 mock 只挂了 setCustomValidity 没挂 reportValidity,再加一条
// `expect(reportValidity).toHaveBeenCalledTimes(1)`。这两条合起来把实现空间锁死成上游那一种
// 写法——"逐个 ref 各自守卫 reportValidity"的实现会因为 ref2 被跳过而 setCustomValidity2 零
// 调用,"逐个 ref 各自调 reportValidity"的实现直接 TypeError,两者都是真实 DOM 下正确的写法
// (每个 <input type="radio"> 都是 HTMLInputElement,都有 reportValidity)。现已把两个 ref 都
// 补成完整 mock,并把次数断言换成"原生校验 UI 至少被触发过一次"。三向验证:RED = base_sha 仍
// 2 failed / 20 passed 且挂在 setCustomValidity2 未被调用(功能缺失,非报错);GREEN = 上游写法
// 22/22;ALT = 上面两种被误杀的写法现在都 22/22。
//
// gotcha 记录(供 review/复用):react-hook-form 的 devDependencies 里 @swc/core / cypress /
// unrs-resolver 都带 postinstall 脚本,pnpm 10+ 默认要求先批准依赖的构建脚本才会运行。本地
// 实测朴素的 `pnpm install --no-frozen-lockfile` 是否会以 ERR_PNPM_IGNORED_BUILDS 退出码 1
// 失败取决于本机 pnpm store 是否"热"(之前跑过 `pnpm approve-builds` 的旧 store 不再提示,全新
// --store-dir 反而没触发过这条阻断)——本地复现是非确定的,不能保证 E2B 沙箱那份 store 恰好是
// 已批准状态。加 `--ignore-scripts` 让安装结果不再依赖 store 是否曾被批准过:本地验证过
// @swc/core 的原生绑定来自平台 optionalDependency 预编译包而非 postinstall 构建,jest(经
// @swc/jest 转译)在 --ignore-scripts 下跑同一份 base_sha 源码结果不变(20/20 通过);husky 的
// prepare 钩子也一并跳过,sandbox 里不需要 git hooks。react-hook-form 题组现已统一使用
// `--ignore-scripts`;pnpm CLI 本身由 eval group 的公共 Sandbox prepare 安装一次。

const BASE_COMMIT = "bb2ce17575bd410cae6859e2878f9108a93bd6bc";

export default defineEval({
  description:
    "react-hook-form pr-13512: with shouldUseNativeValidation, the native setCustomValidity()/reportValidity() " +
    "call for a multi-ref field (radio group) only ever lands on the first ref, leaving the browser's native " +
    "validation bubble anchored to a single radio button instead of the whole group (real react-hook-form issue)",
  diff: { ignore: ["coverage", "node_modules", ".niceeval-clone"] },
  plugins: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-hook-form repository at the commit where the bug " +
          "below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: when a form is created with `shouldUseNativeValidation: true`, react-hook-form is supposed to " +
          "drive the browser's own native validation UI (via `reportValidity()`/`setCustomValidity()`) for every " +
          "input under a field. For a plain single `<input>` this works. But for a radio button group — several " +
          "`<input type=\"radio\">` elements registered under the same field name, so react-hook-form tracks " +
          "multiple DOM refs for one field — the native validity message is only ever applied to the *first* " +
          "radio ref in the group. The other radio inputs sharing that name never get `setCustomValidity()` " +
          "called on them, whether setting an invalid-state message or clearing it back to valid. So the " +
          "browser's native validation bubble ends up anchored to a single radio button instead of reflecting " +
          "the group as a whole, which does not match how native HTML radio-group validation behaves.\n\n" +
          "Fix the library source so that when a field has multiple refs (a radio/checkbox group sharing one " +
          "name), the native `setCustomValidity()` call — both for setting a message and for clearing it — is " +
          "applied to every ref in that group, not just the first one. Do not just add workarounds in test " +
          "files.\n\n" +
          "Environment notes: dependencies are already installed (via `npm install -g pnpm@10.34.5 && " +
          "CYPRESS_INSTALL_BINARY=0 pnpm install --no-frozen-lockfile --ignore-scripts`). Run the relevant tests " +
          "with `node_modules/.bin/jest --config ./scripts/jest/jest.config.js " +
          "src/__tests__/logic/validateField.test.tsx`. Fix the library source; do not just edit tests.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    // 真实仓库路径:覆盖掉 agent 可能留下的任何版本,判分对齐上游隐藏测试。
    await t.sandbox.uploadFile(
      new URL("tests/validateField.test.tsx", import.meta.url),
      "src/__tests__/logic/validateField.test.tsx",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
