import { execFile } from "node:child_process";
import { resolve } from "node:path";
import {
  QUERY_PROTOCOL,
  decodeInspectionDocument,
  narrowInspectionSuccess,
  type InspectionSuccessDocumentFor,
} from "niceeval/inspection";

export interface MemoryBenchReportData {
  readonly generatedAt: string;
  readonly cutoffIdentity: string;
  readonly overview: InspectionSuccessDocumentFor<"overview.get">["overview"];
}

function queryOverview(projectRoot: string): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = execFile(
      resolve(projectRoot, "node_modules/.bin/niceeval"),
      ["query", "run", "--request", "-"],
      { cwd: projectRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`niceeval query failed: ${stderr.trim() || error.message}`, { cause: error }));
          return;
        }
        resolveOutput(stdout);
      },
    );
    child.stdin?.end(`${JSON.stringify({
      protocol: QUERY_PROTOCOL,
      operation: { kind: "overview.get" },
    })}\n`);
  });
}

export async function loadMemoryBenchReport(projectRoot: string): Promise<MemoryBenchReportData> {
  const document = decodeInspectionDocument(JSON.parse(await queryOverview(projectRoot)));
  if (!document.success) throw new TypeError(document.reason);
  const decoded = narrowInspectionSuccess(document.value, "overview.get");
  if (!decoded.success) throw new TypeError(decoded.reason);
  return {
    generatedAt: new Date().toISOString(),
    cutoffIdentity: decoded.value.sealedCutoff.identity,
    overview: decoded.value.overview,
  };
}
