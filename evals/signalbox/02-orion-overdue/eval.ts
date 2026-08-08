import { defineEval } from "niceeval";
import { runHiddenTest, signalboxMetadata, signalboxSandbox } from "../harness.ts";

// 契约表：复用 01 的 Orion 三档窗口、open-only 与排序；本题新增 findOrionOverdue API。
export default defineEval({
  description: "signalbox 02 检查点：按先前约定生成 Orion 超时队列",
  tags: ["signalbox", "longitudinal", "memory-checkpoint", "memory-retrieval"],
  metadata: signalboxMetadata(2, "checkpoint", "retrieval"),
  sandbox: signalboxSandbox(),
  async test(t) {
    await t.send(
      "请实现 `src/orion-overdue.js` 并导出 `findOrionOverdue(incidents, now)`。沿用我们之前约定的 Orion 响应规则和常规队列排序。返回 deadline 早于或等于 `now` 的事件 id；不属于该规则处理范围的事件不要返回。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().stopOnFailure());
    await runHiddenTest(t, new URL("./tests/hidden.test.js", import.meta.url));
  },
});
