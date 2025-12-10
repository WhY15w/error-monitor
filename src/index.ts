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
import { setSenderConfig, flushErrorQueue, cleanupSender } from "./sender";
import type { ErrorMonitorConfig, InternalConfig } from "./types";

// 导出类型供外部使用
export type { ErrorMonitorConfig } from "./types";

/** 是否已初始化 */
let isInitialized = false;

/**
 * 填充默认配置
 */
const normalizeConfig = (config: ErrorMonitorConfig): InternalConfig => {
  return {
    reportUrl: config.reportUrl,
    projectName: config.projectName,
    environment: config.environment,
    sampleRate: config.sampleRate ?? 1,
    maxCacheSize: config.maxCacheSize ?? 10,
    reportDelay: config.reportDelay ?? 2000,
    enableJsError: config.enableJsError ?? true,
    enableNetworkError: config.enableNetworkError ?? true,
    enableResourceError: config.enableResourceError ?? true,
    ignoreErrors: config.ignoreErrors ?? [],
    ignoreUrls: config.ignoreUrls ?? [],
    customData: config.customData ?? {},
  };
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
      "[ErrorMonitor] Already initialized. Call destroy() first to reinitialize."
    );
    return {
      destroy: destroyErrorMonitor,
      flush: flushErrorQueue,
    };
  }

  // 参数校验
  if (!config.reportUrl) {
    throw new Error("[ErrorMonitor] reportUrl is required");
  }
  if (!config.projectName) {
    throw new Error("[ErrorMonitor] projectName is required");
  }

  const normalizedConfig = normalizeConfig(config);

  // 设置 sender 配置
  setSenderConfig(normalizedConfig);

  // 根据配置初始化各类错误监控
  if (normalizedConfig.enableJsError) {
    monitorJavaScriptErrors(normalizedConfig);
  }

  if (normalizedConfig.enableNetworkError) {
    monitorNetworkErrors(normalizedConfig);
  }

  if (normalizedConfig.enableResourceError) {
    monitorResourceErrors(normalizedConfig);
  }

  // 页面卸载前上报剩余错误
  window.addEventListener("beforeunload", flushErrorQueue);

  isInitialized = true;

  console.log(`[ErrorMonitor] Initialized for project: ${config.projectName}`);

  return {
    /** 销毁监控，停止所有监听 */
    destroy: destroyErrorMonitor,
    /** 立即上报所有缓存的错误 */
    flush: flushErrorQueue,
  };
};

/**
 * 销毁错误监控，停止所有监听并恢复原始状态
 */
export const destroyErrorMonitor = () => {
  if (!isInitialized) {
    return;
  }

  // 先上报缓存的错误
  flushErrorQueue();

  // 停止各类监控
  stopJavaScriptErrorMonitor();
  stopNetworkErrorMonitor();
  stopResourceErrorMonitor();

  // 清理 sender
  cleanupSender();

  // 移除 beforeunload 监听
  window.removeEventListener("beforeunload", flushErrorQueue);

  isInitialized = false;

  console.log("[ErrorMonitor] Destroyed");
};
