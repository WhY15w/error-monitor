import { errorEnvelope } from "./errorInfo";
import { createMonitor } from "./lifecycle";
import { sendErrorData } from "./sender";
import {
  getErrorMessage,
  getErrorStack,
  resourceErrorTarget,
  safeRun,
} from "./utils";
import type { JsErrorInfo } from "./types";

/**
 * 开启 JavaScript 错误监控
 * 监听并上报全局的 JavaScript 运行时错误和未处理的 Promise 异常
 *
 * 使用 addEventListener 而非覆盖 window.onerror，因此不会与业务自身的
 * window.onerror / onunhandledrejection 互相覆盖
 */
const monitor = createMonitor("JavaScript error monitoring", (config) => {
  /**
   * 捕获未处理的 JavaScript 错误
   */
  const errorListener = (event: ErrorEvent) => {
    // 资源加载错误由资源监控模块处理
    if (resourceErrorTarget(event)) {
      return;
    }

    safeRun(() => {
      const error = event.error;
      const errorInfo: JsErrorInfo = {
        ...errorEnvelope(config),
        // 跨域脚本未配置 CORS 时，message 只能是 "Script error."
        message: String(
          event.message || (error && error.message) || "Unknown error",
        ),
        source: event.filename || undefined,
        lineno: event.lineno || undefined,
        colno: event.colno || undefined,
        stack: getErrorStack(error),
        errorType: "JavaScript Error",
        url: window.location.href,
      };

      sendErrorData(errorInfo);
    });
  };

  // 捕获未处理的 Promise 错误
  const rejectionListener = (event: PromiseRejectionEvent) => {
    safeRun(() => {
      const reason = event.reason;
      const errorInfo: JsErrorInfo = {
        ...errorEnvelope(config),
        message: getErrorMessage(reason),
        stack: getErrorStack(reason),
        errorType: "Unhandled Promise Rejection",
        url: window.location.href,
      };

      sendErrorData(errorInfo);
    });
  };

  window.addEventListener("error", errorListener, true);
  window.addEventListener("unhandledrejection", rejectionListener);

  return () => {
    window.removeEventListener("error", errorListener, true);
    window.removeEventListener("unhandledrejection", rejectionListener);
  };
});

export const monitorJavaScriptErrors = monitor.start;
export const stopJavaScriptErrorMonitor = monitor.stop;
