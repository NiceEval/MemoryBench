import { defineEval } from "niceeval";
import { signalboxMetadata } from "../metadata.ts";
import { runVerifier } from "../verifier.ts";

// 契约表：更新 01：Orion customer P2=20；internal P2=30；P1=5/P3=240、open-only 不变。
export default defineEval({
  description: "signalbox 04：只对 Orion 客户侧事件缩短 P2 时限",
  tags: ["signalbox", "longitudinal", "memory-update", "memory-scope"],
  metadata: signalboxMetadata(4, "update", "update"),
  async test(t) {
    await t.send(
      "Orion 今天更新了响应规则。当前完整规则是：对两类 audience，open 状态的 P1 都是 5 分钟、P3 都是 240 分钟；customer-facing P2 改为 20 分钟，internal P2 仍为 30 分钟；closed 状态不处理。这取代了 Orion 旧的“所有 P2 均为 30 分钟”规则，并且不影响 Vega。请实现 `src/orion-window.js` 并导出 `orionWindowMinutes(incident)`，返回适用的整数分钟数或 null。补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().orStop());
    await t.sandbox.uploadFile(
      new URL("./tests/hidden.test.js", import.meta.url),
      ".niceeval-hidden.test.js",
    );
    await runVerifier(t);
  },
});
