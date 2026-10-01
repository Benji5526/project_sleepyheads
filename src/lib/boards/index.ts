// WU-401 분석 보드 (TECH §12.4, PHASE3_PLAN §3). Q9(설명 다시 쓰기)는 loadBoardResult를 쓴다.
export { applyBoardFilters, MAX_BOARD_PEERS, parseBoardFilters } from "./filters";
export { maxChartPoints, recomputeBoard, resolveBoardPeers } from "./recompute";
export {
  aggregateSectorMetrics,
  SUMMABLE_SECTOR_METRICS,
  type SectorAggregateParams,
  type SectorAggregateRow,
} from "./sector-aggregate";
export { loadBoardResult, loadBoardRow, saveBoard, toBoardView } from "./store";
