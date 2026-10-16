import { errorEnvelope } from "./errorInfo";
import { createMonitor } from "./lifecycle";
import { sendErrorData } from "./sender";
import { resolveUrl } from "./url";
import { safeRun } from "./utils";
import type { EventSourceErrorInfo, WebSocketErrorInfo } from "./types";

/** WebSocket 静态常量，需要复制到包装函数上 */
const WEBSOCKET_STATICS = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];

/**
 * 把包装函数的原型、name 与静态常量对齐到原生构造函数
 * 使业务侧的 instanceof、WebSocket.OPEN / EventSource.CLOSED 等用法不受影响
 */
const shareConstructorSurface = (
  wrapped: Function,
  Native: Function,
  statics: readonly string[],
) => {
  wrapped.prototype = Native.prototype;
  Object.defineProperty(wrapped, "name", {
    value: Native.name,
    configurable: true,
  });

  for (const key of statics) {
    const descriptor = Object.getOwnPropertyDescriptor(Native, key);
    if (descriptor) {
      Object.defineProperty(wrapped, key, {
        ...descriptor,
        enumerable: true,
        configurable: true,
      });
    }
  }
};

/**
 * 开启 WebSocket 错误监控
 * 捕获连接建立失败、连接期间异常以及非正常关闭（服务端异常断开、TLS 失败等）
 */
const webSocketMonitor = createMonitor(
  "WebSocket error monitoring",
  (config, isActive) => {
    if (typeof window === "undefined" || typeof window.WebSocket !== "function") {
      return () => {};
    }

    const NativeWebSocket = window.WebSocket;

    const buildErrorInfo = (
      target: string,
      phase: WebSocketErrorInfo["phase"],
      extra?: Pick<WebSocketErrorInfo, "closeCode" | "closeReason">,
    ): WebSocketErrorInfo => ({
      ...errorEnvelope(config),
      message:
        phase === "close"
          ? `WebSocket Error: ${target} - closed abnormally (code: ${extra?.closeCode})`
          : `WebSocket Error: ${target} - connection failed`,
      target,
      phase,
      ...extra,
      errorType: "WebSocket Error",
      url: window.location.href,
    });

    /**
     * 包装 WebSocket 构造函数，实例本身仍是原生 WebSocket
     */
    function ErrorMonitorWebSocket(
      this: unknown,
      url: string | URL,
      protocols?: string | string[],
    ) {
      if (!(this instanceof ErrorMonitorWebSocket)) {
        throw new TypeError(
          "Failed to construct 'WebSocket': Please use the 'new' operator.",
        );
      }

      const socket =
        protocols === undefined
          ? new NativeWebSocket(url)
          : new NativeWebSocket(url, protocols);

      const target = resolveUrl(url);
      let errorReported = false;

      socket.addEventListener("error", () => {
        errorReported = true;
        safeRun(() => {
          if (!isActive()) return;
          const phase =
            socket.readyState === NativeWebSocket.OPEN ? "runtime" : "connect";
          sendErrorData(buildErrorInfo(target, phase));
        });
      });

      socket.addEventListener("close", (event) => {
        // wasClean 为 false 说明没有走正常的关闭握手（code 1006 连接异常断开、1015 TLS 失败等）
        if (event.wasClean || errorReported) return;
        safeRun(() => {
          if (!isActive()) return;
          sendErrorData(
            buildErrorInfo(target, "close", {
              closeCode: event.code,
              closeReason: event.reason || undefined,
            }),
          );
        });
      });

      return socket;
    }

    shareConstructorSurface(
      ErrorMonitorWebSocket,
      NativeWebSocket,
      WEBSOCKET_STATICS,
    );
    window.WebSocket = ErrorMonitorWebSocket as unknown as typeof WebSocket;

    return () => {
      window.WebSocket = NativeWebSocket;
    };
  },
);

/**
 * 开启 EventSource (SSE) 错误监控
 * 捕获连接中断（自动重连中）与连接终止（不再重连）两种情况
 */
const eventSourceMonitor = createMonitor(
  "EventSource error monitoring",
  (config, isActive) => {
    if (
      typeof window === "undefined" ||
      typeof window.EventSource !== "function"
    ) {
      return () => {};
    }

    const NativeEventSource = window.EventSource;

    /**
     * 包装 EventSource 构造函数，实例本身仍是原生 EventSource
     */
    function ErrorMonitorEventSource(
      this: unknown,
      url: string | URL,
      init?: EventSourceInit,
    ) {
      if (!(this instanceof ErrorMonitorEventSource)) {
        throw new TypeError(
          "Failed to construct 'EventSource': Please use the 'new' operator.",
        );
      }

      const source =
        init === undefined
          ? new NativeEventSource(url)
          : new NativeEventSource(url, init);

      const target = resolveUrl(url);

      source.addEventListener("error", () => {
        safeRun(() => {
          if (!isActive()) return;

          // readyState 为 CLOSED 表示连接已终止（如 4xx/5xx、返回类型错误）；
          // 否则是网络中断后的自动重连，会持续触发 error，交由 sender 去重聚合计数
          const closed = source.readyState === NativeEventSource.CLOSED;
          const errorInfo: EventSourceErrorInfo = {
            ...errorEnvelope(config),
            message: closed
              ? `EventSource Error: ${target} - connection closed`
              : `EventSource Error: ${target} - connection lost, retrying`,
            target,
            phase: closed ? "close" : "connect",
            readyState: source.readyState,
            errorType: "EventSource Error",
            url: window.location.href,
          };

          sendErrorData(errorInfo);
        });
      });

      return source;
    }

    shareConstructorSurface(ErrorMonitorEventSource, NativeEventSource, [
      "CLOSED",
    ]);
    window.EventSource = ErrorMonitorEventSource as unknown as typeof EventSource;

    return () => {
      window.EventSource = NativeEventSource;
    };
  },
);

export const monitorWebSocketErrors = webSocketMonitor.start;
export const stopWebSocketErrorMonitor = webSocketMonitor.stop;
export const monitorEventSourceErrors = eventSourceMonitor.start;
export const stopEventSourceErrorMonitor = eventSourceMonitor.stop;
