import { sendErrorData } from "./sender";
import type { InternalConfig, NetworkErrorInfo } from "./types";

let originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalFetch: typeof window.fetch | null = null;

let isInitialized = false;

/**
 * 开启网络错误监控
 * 劫持并监听 XMLHttpRequest 和 fetch 请求，捕获网络异常
 *
 * @param {InternalConfig} config - 监控配置
 */
export const monitorNetworkErrors = (config: InternalConfig) => {
  if (isInitialized) {
    console.warn(
      "[ErrorMonitor] Network error monitoring is already initialized"
    );
    return;
  }

  const { reportUrl, projectName, environment } = config;

  originalXhrOpen = XMLHttpRequest.prototype.open;
  const savedXhrOpen = originalXhrOpen;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...args: any[]
  ) {
    const _urlStr = typeof url === "string" ? url : String(url);

    // 跳过上报请求自身
    if (_urlStr.includes(reportUrl)) {
      return savedXhrOpen.apply(this, [method, url, ...args] as any);
    }

    // 监听 error 事件，当请求失败时触发
    this.addEventListener("error", () => {
      const errorInfo: NetworkErrorInfo = {
        message: `XHR Error: ${method} ${_urlStr}`,
        method,
        url: _urlStr,
        projectName,
        environment,
        errorType: "XHR Error",
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };
      sendErrorData(errorInfo, reportUrl);
    });

    // 监听 load 事件，检查状态码
    this.addEventListener("load", function () {
      if (this.status >= 400) {
        const errorInfo: NetworkErrorInfo = {
          message: `XHR Error: ${method} ${_urlStr} - ${this.status} ${this.statusText}`,
          method,
          url: _urlStr,
          statusCode: this.status,
          statusText: this.statusText,
          projectName,
          environment,
          errorType: "XHR Error",
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        };
        sendErrorData(errorInfo, reportUrl);
      }
    });

    // 监听超时
    this.addEventListener("timeout", () => {
      const errorInfo: NetworkErrorInfo = {
        message: `XHR Timeout: ${method} ${_urlStr}`,
        method,
        url: _urlStr,
        projectName,
        environment,
        errorType: "XHR Error",
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };
      sendErrorData(errorInfo, reportUrl);
    });

    // 调用原生的 open 方法，保证正常请求流程
    return savedXhrOpen.apply(this, [method, url, ...args] as any);
  };

  // 劫持 fetch
  originalFetch = window.fetch;
  const savedFetch = originalFetch;

  window.fetch = async (input, init) => {
    const urlStr = input instanceof Request ? input.url : String(input);
    const method =
      init?.method || (input instanceof Request ? input.method : "GET");

    // 跳过上报请求自身
    if (urlStr.includes(reportUrl)) {
      return savedFetch(input, init);
    }

    try {
      const response = await savedFetch(input, init);

      // 检查响应状态，如果不是 2xx 则视为错误
      if (!response.ok) {
        const errorInfo: NetworkErrorInfo = {
          message: `Fetch Error: ${method} ${urlStr} - ${response.status} ${response.statusText}`,
          method,
          url: urlStr,
          statusCode: response.status,
          statusText: response.statusText,
          projectName,
          environment,
          errorType: "Fetch Error",
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        };
        sendErrorData(errorInfo, reportUrl);
      }
      return response;
    } catch (error) {
      // 捕获 fetch 执行过程中的异常（如网络断开）
      const errorInfo: NetworkErrorInfo = {
        message: `Fetch Error: ${method} ${urlStr} - ${
          error instanceof Error ? error.message : "Network Error"
        }`,
        method,
        url: urlStr,
        projectName,
        environment,
        errorType: "Fetch Error",
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };
      sendErrorData(errorInfo, reportUrl);
      throw error;
    }
  };

  isInitialized = true;
};

/**
 * 停止网络错误监控，恢复原生方法
 */
export const stopNetworkErrorMonitor = () => {
  if (!isInitialized) return;

  if (originalXhrOpen) {
    XMLHttpRequest.prototype.open = originalXhrOpen;
    originalXhrOpen = null;
  }

  if (originalFetch) {
    window.fetch = originalFetch;
    originalFetch = null;
  }

  isInitialized = false;
};
