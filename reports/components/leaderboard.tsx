/**
 * 旧版 React 报告组件已移除。当前 NiceEval Report 只能消费公开 projection，
 * 不能在 render 时聚合或读取 Record；排名应在后续 Calculation 中用明确分母重建。
 */
export const leaderboardMigrationNote =
  "Use a report Calculation with explicit projections and denominator before adding a leaderboard.";
