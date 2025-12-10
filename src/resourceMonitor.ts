import { sendErrorData } from "./sender";
import type { InternalConfig, ResourceErrorInfo } from "./types";

const MONITORED_TAGS = ["IMG", "SCRIPT", "LINK", "VIDEO", "AUDIO", "SOURCE"];

let errorHandler: ((event: Event) => void) | null = null;
let isInitialized = false;

/**
 * 开启资源加载错误监控
 * 监听图片、脚本、样式表、媒体等资源加载失败的错误
 *
 * @param {InternalConfig} config - 监控配置
 */
export const monitorResourceErrors = (config: InternalConfig) => {
  if (isInitialized) {
    console.warn(
      "[ErrorMonitor] Resource error monitoring is already initialized"
    );
    return;
  }

  const { reportUrl, projectName, environment } = config;

  /**
   * 监听全局 error 事件
   * 注意：资源加载错误不会冒泡，所以必须在捕获阶段处理 (useCapture = true)
   */
  errorHandler = (event: Event) => {
    const target = event.target as HTMLElement;

    // 检查是否为资源加载错误
    if (!target || !MONITORED_TAGS.includes(target.tagName)) {
      return;
    }

    // 获取资源 URL
    const resourceUrl =
      (target as HTMLImageElement | HTMLScriptElement).src ||
      (target as HTMLLinkElement).href ||
      null;

    // 跳过空 URL 或 data URL
    if (!resourceUrl || resourceUrl.startsWith("data:")) {
      return;
    }

    const errorInfo: ResourceErrorInfo = {
      message: `Resource Load Error: ${target.tagName} - ${resourceUrl}`,
      tagName: target.tagName,
      resourceUrl,
      projectName,
      environment,
      errorType: "Resource Load Error",
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    sendErrorData(errorInfo, reportUrl);
  };

  window.addEventListener("error", errorHandler, true);
  isInitialized = true;
};

/**
 * 停止资源错误监控
 */
export const stopResourceErrorMonitor = () => {
  if (!isInitialized || !errorHandler) return;

  window.removeEventListener("error", errorHandler, true);
  errorHandler = null;
  isInitialized = false;
};
