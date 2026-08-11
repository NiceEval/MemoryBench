import { defineEval } from "niceeval";
import { signalboxMetadata } from "../metadata.ts";
import { runVerifier } from "../verifier.ts";

// 契约表：建立 Orion P1=5/P2=30/P3=240、open-only、UTC ISO；不复用前序。
export default defineEval({
  description: "signalbox 01：建立 Orion 响应时限规则",
  tags: ["signalbox", "longitudinal", "memory-addition"],
  metadata: signalboxMetadata(1, "learn", "addition"),
  async test(t) {
    await t.send(
      "请实现 `src/orion-deadline.js` 并导出 `orionDeadlineFor(incident)`。这是 Orion 支持团队长期采用的响应规则：open 状态的 P1 事件在 `createdAt` 后 5 分钟到期，P2 在 30 分钟后到期，P3 在 240 分钟后到期；closed 状态返回 null。deadline 必须输出为 UTC ISO-8601 字符串。以后所有 Orion 队列都按 deadline 从早到晚排列，deadline 相同时再按 `id` 字母序排列。使用 README 中定义的事件字段，补充有针对性的公开测试，不要增加依赖，并运行测试套件。",
    ).then((turn) => turn.succeeded().stopOnFailure());
    await t.sandbox.uploadFile(
      new URL("./tests/hidden.test.js", import.meta.url),
      ".niceeval-hidden.test.js",
    );
    await runVerifier(t);
  },
});
