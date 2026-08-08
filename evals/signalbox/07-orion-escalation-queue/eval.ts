import { defineEval } from "niceeval";
import { runHiddenTest, signalboxMetadata, signalboxSandbox } from "../harness.ts";

// 契约表：复用 06 当前 Orion 默认值+regulated 例外，以及 01 的 UTC/排序约定。
export default defineEval({
  description: "signalbox 07 检查点：组合 Orion 默认规则与当前例外",
  tags: ["signalbox", "longitudinal", "memory-checkpoint", "memory-scope"],
  metadata: signalboxMetadata(7, "checkpoint", "scope"),
  sandbox: signalboxSandbox(),
  async test(t) {
    await t.send(
      "请实现 `src/orion-queue.js` 并导出 `buildOrionEscalationQueue(incidents)`。使用 Orion 当前的响应规则和仍然有效的例外。返回需要处理的 `{ id, deadline }` 记录，沿用我们约定的时间格式和队列排序。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().stopOnFailure());
    await runHiddenTest(t, new URL("./tests/hidden.test.js", import.meta.url));
  },
});
