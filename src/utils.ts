/**
 * 取资源加载错误的出错元素
 * 资源错误的 event.target 是具体元素，JS 运行时错误的 target 是 window
 */
export const resourceErrorTarget = (event: Event): Element | null =>
  event.target instanceof Element ? event.target : null;

/**
 * 从任意 rejection reason 中提取可读消息
 * reason 可能不是 Error（字符串、对象、null 等）
 */
export const getErrorMessage = (reason: unknown): string => {
  if (typeof reason === "string") {
    return reason || "Unknown Promise Error";
  }

  if (reason instanceof Error) {
    return reason.message || String(reason);
  }

  if (reason && typeof reason === "object") {
    const message = (reason as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
    try {
      return JSON.stringify(reason) ?? String(reason);
    } catch {
      return Object.prototype.toString.call(reason);
    }
  }

  if (reason === undefined) {
    return "Unknown Promise Error";
  }

  return String(reason);
};

/**
 * 从任意值中提取堆栈信息
 */
export const getErrorStack = (reason: unknown): string | null => {
  if (!reason || typeof reason !== "object") {
    return null;
  }

  const stack = (reason as { stack?: unknown }).stack;
  return typeof stack === "string" && stack ? stack : null;
};

/**
 * 执行监控自身的逻辑并吞掉异常
 * 监控代码不允许抛出异常影响宿主应用
 */
export const safeRun = (fn: () => void): void => {
  try {
    fn();
  } catch (error) {
    if (typeof console !== "undefined") {
      console.warn("[ErrorMonitor] internal error:", error);
    }
  }
};
