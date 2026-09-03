import type { TestContext } from "niceeval";
import { commandSucceeded } from "niceeval/expect";

const HIDDEN_TEST = ".niceeval-hidden.test.js";

/** 运行已由当前 eval 在最后一轮后显式上传的隐藏测试。 */
export const runVerifier = async (t: TestContext) => {
  const result = await t.sandbox.runCommand("node", ["--test", HIDDEN_TEST]);
  await t.sandbox.runCommand("rm", [HIDDEN_TEST]);
  t.check(result, commandSucceeded());
};
