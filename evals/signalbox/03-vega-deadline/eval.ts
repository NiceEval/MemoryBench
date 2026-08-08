import { defineEval } from "niceeval";
import { runHiddenTest, signalboxMetadata } from "../harness.ts";

// 契约表：新增独立 Vega P1=10/P2=45/P3=360；明确不更新 01 的 Orion 规则。
export default defineEval({
  description: "signalbox 03：加入相似但相互独立的 Vega 规则",
  tags: ["signalbox", "longitudinal", "memory-interference"],
  metadata: signalboxMetadata(3, "interference", "interference"),
  async test(t) {
    await t.send(
      "Vega Support 是另一个独立客户，本次需求不改变任何 Orion 规则。请实现 `src/vega-deadline.js` 并导出 `vegaDeadlineFor(incident)`：open 状态的 P1 事件在 10 分钟后到期，P2 在 45 分钟后到期，P3 在 360 分钟后到期；closed 状态返回 null。结果输出为 UTC ISO-8601 字符串。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().stopOnFailure());
    await runHiddenTest(t, new URL("./tests/hidden.test.js", import.meta.url));
  },
});
