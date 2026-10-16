import {
  monitorJavaScriptErrors,
  stopJavaScriptErrorMonitor,
} from "./errorHandler";
import {
  monitorNetworkErrors,
  stopNetworkErrorMonitor,
} from "./networkMonitor";
import {
  monitorResourceErrors,
  stopResourceErrorMonitor,
} from "./resourceMonitor";
import {
  monitorEventSourceErrors,
  monitorWebSocketErrors,
  stopEventSourceErrorMonitor,
  stopWebSocketErrorMonitor,
} from "./realtimeMonitor";
import { setSenderConfig, flushErrorQueue, cleanupSender } from "./sender";
import type { ErrorMonitorConfig, InternalConfig } from "./types";

// 导出类型供外部使用
export type {
  BaseErrorInfo,
  ErrorInfo,
  ErrorMonitorConfig,
  EventSourceErrorInfo,
  JsErrorInfo,
  NetworkErrorInfo,
  ResourceErrorInfo,
  WebSocketErrorInfo,
} from "./types";

/** 去重窗口默认值：5 分钟 */
const DEFAULT_DEDUPE_WINDOW = 5 * 60 * 1000;

/** 是否已初始化 */
let isInitialized = false;

/** 数值型配置的兜底与收敛：NaN 回落到默认值，数值收敛到 [min, max] */
const clampNumber = (
  value: number | undefined,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(Math.max(num, min), max);
};

/**
 * 填充默认配置
 */
const normalizeConfig = (config: ErrorMonitorConfig): InternalConfig => {
  return {
    reportUrl: config.reportUrl,
    projectName: config.projectName,
    environment: config.environment || "unknown",
    sampleRate: clampNumber(config.sampleRate, 1, 0, 1),
    maxCacheSize: Math.round(clampNumber(config.maxCacheSize, 10, 1)),
    reportDelay: clampNumber(config.reportDelay, 2000, 0),
    dedupeWindow: clampNumber(config.dedupeWindow, DEFAULT_DEDUPE_WINDOW, 0),
    maxStackLength: clampNumber(config.maxStackLength, 5000, 200),
    enableJsError: config.enableJsError ?? true,
    enableNetworkError: config.enableNetworkError ?? true,
    enableResourceError: config.enableResourceError ?? true,
    enableWebSocketError: config.enableWebSocketError ?? true,
    enableEventSourceError: config.enableEventSourceError ?? true,
    ignoreErrors: config.ignoreErrors ?? [],
    ignoreUrls: config.ignoreUrls ?? [],
    customData: config.customData ?? {},
  };
};

/**
 * 各类错误监控的启停配对
 * init 与 destroy 都按这张表执行，避免两边手工维护配对关系
 */
const MONITORS: Array<{
  enabled: (config: InternalConfig) => boolean;
  start: (config: InternalConfig) => void;
  stop: () => void;
}> = [
  {
    enabled: (config) => config.enableJsError,
    start: monitorJavaScriptErrors,
    stop: stopJavaScriptErrorMonitor,
  },
  {
    enabled: (config) => config.enableNetworkError,
    start: monitorNetworkErrors,
    stop: stopNetworkErrorMonitor,
  },
  {
    enabled: (config) => config.enableResourceError,
    start: monitorResourceErrors,
    stop: stopResourceErrorMonitor,
  },
  {
    enabled: (config) => config.enableWebSocketError,
    start: monitorWebSocketErrors,
    stop: stopWebSocketErrorMonitor,
  },
  {
    enabled: (config) => config.enableEventSourceError,
    start: monitorEventSourceErrors,
    stop: stopEventSourceErrorMonitor,
  },
];

/** 页面隐藏/卸载前上报剩余错误，force 上报会带出被去重扣留的重复次数 */
const flushOnPageHide = () => {
  flushErrorQueue(true);
};

/** 移动端 beforeunload 不可靠，页面切到后台时也要尽量把数据送出 */
const flushWhenHidden = () => {
  if (document.visibilityState === "hidden") {
    flushErrorQueue(true);
  }
};

/**
 * 初始化错误监控 SDK
 * 该函数是 SDK 的入口，负责启动各类错误监控模块
 *
 * @param {ErrorMonitorConfig} config - 监控配置对象
 * @returns {{ destroy: () => void, flush: () => void }} 返回控制对象
 *
 * @example
 * ```javascript
 * const monitor = ErrorMonitor.initErrorMonitor({
 *   reportUrl: "https://api.example.com/errors",
 *   projectName: "my-app",
 *   environment: "production",
 *   sampleRate: 0.5, // 50% 采样率
 *   ignoreErrors: [/ResizeObserver/], // 忽略特定错误
 * });
 *
 * // 手动上报缓存的错误
 * monitor.flush();
 *
 * // 停止监控
 * monitor.destroy();
 * ```
 */
export const initErrorMonitor = (config: ErrorMonitorConfig) => {
  if (isInitialized) {
    console.warn(
      "[ErrorMonitor] Already initialized. Call destroy() first to reinitialize.",
    );
    return {
      destroy: destroyErrorMonitor,
      flush: () => flushErrorQueue(true),
    };
  }

  // 参数校验
  if (typeof config?.reportUrl !== "string" || !config.reportUrl) {
    throw new Error("[ErrorMonitor] reportUrl is required");
  }
  if (typeof config.projectName !== "string" || !config.projectName) {
    throw new Error("[ErrorMonitor] projectName is required");
  }

  const normalizedConfig = normalizeConfig(config);

  // 设置 sender 配置
  setSenderConfig(normalizedConfig);

  // 根据配置启动各类错误监控
  for (const monitor of MONITORS) {
    if (monitor.enabled(normalizedConfig)) {
      monitor.start(normalizedConfig);
    }
  }

  // 页面卸载前上报剩余错误（pagehide 覆盖移动端与 bfcache 场景）
  window.addEventListener("beforeunload", flushOnPageHide);
  window.addEventListener("pagehide", flushOnPageHide);
  document.addEventListener("visibilitychange", flushWhenHidden);

  isInitialized = true;

  console.log(`[ErrorMonitor] Initialized for project: ${config.projectName}`);

  return {
    /** 销毁监控，停止所有监听 */
    destroy: destroyErrorMonitor,
    /** 立即上报所有缓存的错误（含仍被去重扣留的重复次数） */
    flush: () => flushErrorQueue(true),
  };
};

/**
 * 销毁错误监控，停止所有监听并恢复原始状态
 */
export const destroyErrorMonitor = () => {
  if (!isInitialized) {
    return;
  }

  // 先上报缓存的错误（含仍在去重窗口内的累计次数）
  flushErrorQueue(true);

  for (const monitor of MONITORS) {
    monitor.stop();
  }

  // 清理 sender 状态，最终上报已在上面完成
  cleanupSender();

  // 移除卸载监听
  window.removeEventListener("beforeunload", flushOnPageHide);
  window.removeEventListener("pagehide", flushOnPageHide);
  document.removeEventListener("visibilitychange", flushWhenHidden);

  isInitialized = false;

  console.log("[ErrorMonitor] Destroyed");
};
