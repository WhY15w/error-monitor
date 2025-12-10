import { sendErrorData } from "./sender";
import type { InternalConfig, JsErrorInfo } from "./types";

let originalOnError: OnErrorEventHandler | null = null;
let originalOnUnhandledRejection:
  | ((event: PromiseRejectionEvent) => any)
  | null = null;

let isInitialized = false;

/**
 * 开启 JavaScript 错误监控
 * 监听并上报全局的 JavaScript 运行时错误和未处理的 Promise 异常
 *
 * @param {InternalConfig} config - 监控配置
 */
export const monitorJavaScriptErrors = (config: InternalConfig) => {
  if (isInitialized) {
    console.warn(
      "[ErrorMonitor] JavaScript error monitoring is already initialized"
    );
    return;
  }

  const { reportUrl, projectName, environment } = config;

  // 保存原有的 onerror 处理函数，防止覆盖
  originalOnError = window.onerror;

  /**
   *  捕获未处理的 JavaScript 错误
   */
  window.onerror = (message, source, lineno, colno, error) => {
    const errorInfo: JsErrorInfo = {
      message: String(message),
      source,
      lineno,
      colno,
      stack: error ? error.stack : null,
      projectName,
      environment,
      errorType: "JavaScript Error",
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // 上报错误数据
    sendErrorData(errorInfo, reportUrl);

    // 如果原来有 onerror 处理函数，继续执行它
    if (originalOnError) {
      return originalOnError(message, source, lineno, colno, error);
    }
  };

  // 保存原有的处理函数
  originalOnUnhandledRejection = window.onunhandledrejection;

  // 捕获未处理的 Promise 错误
  window.onunhandledrejection = (event) => {
    const reason = (event as any).reason;
    const errorInfo: JsErrorInfo = {
      message: reason
        ? reason.message || String(reason)
        : "Unknown Promise Error",
      stack: reason && reason.stack ? reason.stack : null,
      projectName,
      environment,
      errorType: "Unhandled Promise Rejection",
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // 上报错误数据
    sendErrorData(errorInfo, reportUrl);

    // 如果原来有处理函数，继续执行它
    if (originalOnUnhandledRejection) {
      return originalOnUnhandledRejection.call(window, event);
    }
  };

  isInitialized = true;
};

/**
 * 停止 JavaScript 错误监控，恢复原有处理函数
 */
export const stopJavaScriptErrorMonitor = () => {
  if (!isInitialized) return;

  window.onerror = originalOnError;
  window.onunhandledrejection = originalOnUnhandledRejection;
  originalOnError = null;
  originalOnUnhandledRejection = null;
  isInitialized = false;
};
