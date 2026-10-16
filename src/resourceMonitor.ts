import { errorEnvelope } from "./errorInfo";
import { createMonitor } from "./lifecycle";
import { sendErrorData } from "./sender";
import { resourceErrorTarget, safeRun } from "./utils";
import type { ResourceErrorInfo } from "./types";

/**
 * 会触发 error 事件的资源标签
 * IMAGE 是 SVG 内的 <image>，其 tagName 为小写
 */
const MONITORED_TAGS = new Set([
  "IMG",
  "IMAGE",
  "SCRIPT",
  "LINK",
  "VIDEO",
  "AUDIO",
  "SOURCE",
  "TRACK",
  "EMBED",
  "OBJECT",
]);

/**
 * 提取资源地址
 * - IMG/VIDEO/AUDIO 使用 currentSrc，响应式图片下它是真正加载失败的地址
 * - OBJECT 的地址在 data 属性上
 */
const getResourceUrl = (target: Element): string | null => {
  const element = target as Element & {
    currentSrc?: string;
    src?: string;
    href?: string;
    data?: string;
  };

  const url =
    element.currentSrc || element.src || element.href || element.data || null;

  return url ? String(url) : null;
};

/**
 * 开启资源加载错误监控
 * 监听图片、脚本、样式表、媒体等资源加载失败的错误
 */
const monitor = createMonitor("Resource error monitoring", (config) => {
  /**
   * 监听全局 error 事件
   * 注意：资源加载错误不会冒泡，所以必须在捕获阶段处理 (useCapture = true)
   */
  const errorListener = (event: Event) => {
    const target = resourceErrorTarget(event);
    if (!target || !MONITORED_TAGS.has(target.tagName.toUpperCase())) {
      return;
    }

    const resourceUrl = getResourceUrl(target);

    // 跳过空 URL 或内联资源
    if (
      !resourceUrl ||
      resourceUrl.startsWith("data:") ||
      resourceUrl.startsWith("blob:")
    ) {
      return;
    }

    safeRun(() => {
      const errorInfo: ResourceErrorInfo = {
        ...errorEnvelope(config),
        message: `Resource Load Error: ${target.tagName} - ${resourceUrl}`,
        tagName: target.tagName,
        resourceUrl,
        errorType: "Resource Load Error",
        url: window.location.href,
      };

      sendErrorData(errorInfo);
    });
  };

  window.addEventListener("error", errorListener, true);

  return () => {
    window.removeEventListener("error", errorListener, true);
  };
});

export const monitorResourceErrors = monitor.start;
export const stopResourceErrorMonitor = monitor.stop;
