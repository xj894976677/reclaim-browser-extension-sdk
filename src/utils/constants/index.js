// add all constants here
export * from "./constants";
export * from "./interfaces";

// Backward-compatible aliases (old RECLAIM_ names still used across the codebase)
export { JOCLAIM_SDK_ACTIONS as RECLAIM_SDK_ACTIONS } from "./interfaces";
export { JOCLAIM_SESSION_STATUS as RECLAIM_SESSION_STATUS } from "./interfaces";
