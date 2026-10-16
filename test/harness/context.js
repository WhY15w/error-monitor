/**
 * 原生引用与哨兵
 * 必须在本模块（init 之前）捕获，用于校验 SDK 是否留下副作用
 */
export const NativeWS = window.WebSocket;
export const NativeES = window.EventSource;
export const NativeFetch = window.fetch;
export const NativeXhrOpen = XMLHttpRequest.prototype.open;
export const NativeWSPrototype = NativeWS.prototype;

let appOnErrorCalled = false;
const sentinelOnError = function () {
  appOnErrorCalled = true;
};
// SDK 初始化前，业务已经挂了 window.onerror
window.onerror = sentinelOnError;

export const config = {
  reportUrl: "http://localhost:3000/error-report",
  projectName: "Test-Playground",
  environment: "dev",
  reportDelay: 800,
  maxCacheSize: 100,
  dedupeWindow: 60000,
  ignoreErrors: [/ResizeObserver loop/],
  ignoreUrls: [/ignored-by-config/],
  customData: { buildVersion: "test-1", scenario: "e2e" },
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const fetchReports = async () =>
  await (await fetch("/__reports")).json();
export const resetReports = async () => {
  await fetch("/__reset");
};
export const hasText = (value, text) =>
  typeof value === "string" && value.includes(text);

/**
 * 页面级共享状态
 * monitor 由本模块初始化，log 由 runner 装配，场景与压力测试通过 ctx 访问
 */
export const ctx = {
  monitor: null,
  monitorDestroyed: false,
  log: () => {},
};

ctx.monitor = ErrorMonitor.initErrorMonitor(config);

/** runAll 结束会 destroy()，此时压力测试按钮需要重新初始化 */
export const ensureMonitor = () => {
  if (!ctx.monitorDestroyed) return;

  ctx.monitor = ErrorMonitor.initErrorMonitor(config);
  ctx.monitorDestroyed = false;
  ctx.log("监控已重新初始化");
};

export const isSentinelOnError = () => window.onerror === sentinelOnError;
export const isAppOnErrorCalled = () => appOnErrorCalled;
