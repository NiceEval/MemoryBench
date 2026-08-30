import { Effect } from "effect";
import { createRequire } from "node:module";
import {
  QUERY_PROTOCOL,
  narrowInspectionSuccess,
  type InspectionSuccessDocumentFor,
} from "niceeval/inspection";
import type { InspectionHost, InspectionHostFailure } from "niceeval/inspection/host";

// Astro bundles linked dependencies during prerendering. Loading the supported
// CommonJS condition keeps NiceEval's canonical CJS graph external to that bundle.
const { inspectionHost } = createRequire(import.meta.url)("niceeval/inspection/host") as {
  readonly inspectionHost: InspectionHost;
};

export interface MemoryBenchReportData {
  readonly generatedAt: string;
  readonly cutoffIdentity: string;
  readonly overview: InspectionSuccessDocumentFor<"overview.get">["overview"];
}

export async function loadMemoryBenchReport(projectRoot: string): Promise<MemoryBenchReportData> {
  return Effect.runPromise(inspectionHost.withSource<MemoryBenchReportData, InspectionHostFailure, never>(
    { kind: "project", projectRoot },
    (session) => Effect.gen(function*() {
      const batch = yield* session.runBatch({
        budget: { maximumDocuments: 1, maximumInlineBytes: 16 * 1024 * 1024 },
        requests: [{ protocol: QUERY_PROTOCOL, operation: { kind: "overview.get" } }],
      });
      const decoded = narrowInspectionSuccess(batch.documents[0]!, "overview.get");
      if (!decoded.success) return yield* Effect.die(new TypeError(decoded.reason));
      return {
        generatedAt: new Date().toISOString(),
        cutoffIdentity: batch.sealedCutoff.identity,
        overview: decoded.value.overview,
      };
    }),
  ));
}
