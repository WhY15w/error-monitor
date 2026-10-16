import { errorEnvelope } from "./errorInfo";
import { createMonitor } from "./lifecycle";
import { sendErrorData } from "./sender";
import { createReportingUrlMatcher, resolveUrl } from "./url";
import { getErrorMessage, safeRun } from "./utils";
import type { NetworkErrorInfo } from "./types";

interface XhrMeta {
  method: string;
  url: string;
}

/**
 * 判断 fetch 失败是否属于业务主动取消（不应视为错误）
 */
const isIntentionalAbort = (
  error: unknown,
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean => {
  // 主动取消的典型表现
  if ((error as { name?: unknown } | null)?.name === "AbortError") {
    return true;
  }

  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (!signal?.aborted) {
    return false;
  }

  // AbortSignal.timeout() 触发的是超时（TimeoutError），属于需要上报的失败；
  // 其余 abort 原因都视为业务主动取消
  return (signal.reason as { name?: string } | null)?.name !== "TimeoutError";
};

/**
 * 开启网络错误监控
 * 劫持并监听 XMLHttpRequest 和 fetch 请求，捕获网络异常
 */
const monitor = createMonitor("Network error monitoring", (config, isActive) => {
  const isReportingUrl = createReportingUrlMatcher(config.reportUrl);
  /** 每个 XHR 实例的请求信息：实例可被重复 open，事件触发时以最新信息为准 */
  const xhrMeta = new WeakMap<XMLHttpRequest, XhrMeta>();
  /** 监听器只挂一次，避免同一实例多次 open 后重复上报 */
  const hookedXhrs = new WeakSet<XMLHttpRequest>();

  /**
   * 读取请求信息，跳过 SDK 自身的上报请求与已卸载的监控
   */
  const readMeta = (xhr: XMLHttpRequest): XhrMeta | null => {
    if (!isActive()) return null;

    const meta = xhrMeta.get(xhr);
    if (!meta || isReportingUrl(meta.url)) {
      return null;
    }
    return meta;
  };

  /**
   * 组装并上报 XHR 错误，extra 由具体的失败原因（网络中断、超时、HTTP 状态码）提供
   */
  const reportXhrError = (
    xhr: XMLHttpRequest,
    extra: (meta: XhrMeta) => { message: string } & Partial<NetworkErrorInfo>,
  ) => {
    const meta = readMeta(xhr);
    if (!meta) return;

    sendErrorData({
      ...errorEnvelope(config),
      method: meta.method,
      url: meta.url,
      errorType: "XHR Error",
      ...extra(meta),
    });
  };

  const attachXhrListeners = (xhr: XMLHttpRequest) => {
    // 请求失败：网络中断、DNS 失败、被 CORS 拦截等
    xhr.addEventListener("error", function (this: XMLHttpRequest) {
      safeRun(() =>
        reportXhrError(this, (meta) => ({
          message: `XHR Error: ${meta.method} ${meta.url}`,
        })),
      );
    });

    // 超时（业务调用 abort() 触发的 abort 事件不算错误，不上报）
    xhr.addEventListener("timeout", function (this: XMLHttpRequest) {
      safeRun(() =>
        reportXhrError(this, (meta) => ({
          message: `XHR Timeout: ${meta.method} ${meta.url}`,
        })),
      );
    });

    // HTTP 错误状态码
    xhr.addEventListener("load", function (this: XMLHttpRequest) {
      safeRun(() => {
        // status 为 0 表示请求未真正完成（file:// 协议、请求被拦截等），不作为 HTTP 错误上报
        if (this.status < 400) return;

        const { status, statusText } = this;
        reportXhrError(this, (meta) => ({
          message: `XHR Error: ${meta.method} ${meta.url} - ${status} ${statusText}`,
          statusCode: status,
          statusText,
        }));
      });
    });
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...args: unknown[]
  ) {
    xhrMeta.set(this, {
      method: String(method).toUpperCase(),
      url: resolveUrl(url),
    });

    if (!hookedXhrs.has(this)) {
      hookedXhrs.add(this);
      attachXhrListeners(this);
    }

    return originalXhrOpen.apply(
      this,
      [method, url, ...args] as Parameters<XMLHttpRequest["open"]>,
    );
  };

  // 劫持 fetch
  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const [input, init] = args;

    // 先把原始 Promise 交还给业务，不额外包一层 async 造成的时序变化
    const promise = originalFetch.apply(this, args);

    safeRun(() => {
      const url = resolveUrl(
        input instanceof Request ? input.url : String(input),
      );
      if (!isActive() || isReportingUrl(url)) {
        return;
      }

      const method = (
        init?.method || (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      promise.then(
        (response) => {
          safeRun(() => {
            // status 为 0 表示 opaque 响应（no-cors 跨域），无法判断成败，不上报
            if (response.status < 400) return;

            sendErrorData({
              ...errorEnvelope(config),
              message: `Fetch Error: ${method} ${url} - ${response.status} ${response.statusText}`,
              method,
              url,
              statusCode: response.status,
              statusText: response.statusText,
              errorType: "Fetch Error",
            });
          });
        },
        (error) => {
          safeRun(() => {
            if (isIntentionalAbort(error, input, init)) return;

            sendErrorData({
              ...errorEnvelope(config),
              message: `Fetch Error: ${method} ${url} - ${getErrorMessage(error)}`,
              method,
              url,
              errorType: "Fetch Error",
            });
          });
        },
      );
    });

    return promise;
  };

  return () => {
    XMLHttpRequest.prototype.open = originalXhrOpen;
    window.fetch = originalFetch;
  };
});

export const monitorNetworkErrors = monitor.start;
export const stopNetworkErrorMonitor = monitor.stop;
