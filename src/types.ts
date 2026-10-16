/**
 * 错误监控配置接口
 */
export interface ErrorMonitorConfig {
  /** 上报错误的服务端地址 */
  reportUrl: string;
  /** 项目名称 */
  projectName: string;
  /** 当前环境，如 "production", "development"，默认 "unknown" */
  environment?: string;
  /** 采样率 0-1，默认 1（100%上报） */
  sampleRate?: number;
  /** 最大错误缓存数量，达到后批量上报，默认 10 */
  maxCacheSize?: number;
  /** 上报延迟时间(ms)，用于合并错误，默认 2000 */
  reportDelay?: number;
  /** 相同错误的去重窗口(ms)，窗口外的重复错误会带上发生次数再次上报，默认 300000(5分钟) */
  dedupeWindow?: number;
  /** 上报堆栈的最大长度，超出截断，默认 5000 */
  maxStackLength?: number;
  /** 是否启用 JS 错误监控，默认 true */
  enableJsError?: boolean;
  /** 是否启用网络错误监控，默认 true */
  enableNetworkError?: boolean;
  /** 是否启用资源加载错误监控，默认 true */
  enableResourceError?: boolean;
  /** 是否启用 WebSocket 错误监控，默认 true */
  enableWebSocketError?: boolean;
  /** 是否启用 EventSource (SSE) 错误监控，默认 true */
  enableEventSourceError?: boolean;
  /** 忽略的错误消息正则列表 */
  ignoreErrors?: RegExp[];
  /** 忽略的 URL 正则列表（会匹配请求地址、资源地址、脚本地址与页面地址） */
  ignoreUrls?: RegExp[];
  /** 自定义数据，会附加到每条错误记录 */
  customData?: Record<string, any>;
}

/**
 * 错误信息基础接口
 */
export interface BaseErrorInfo {
  message: string;
  projectName: string;
  environment: string;
  errorType: string;
  timestamp: string;
  userAgent: string;
  /** 页面地址；网络错误的 url 是出错请求的地址 */
  url?: string;
  customData?: Record<string, any>;
  /** 自上次上报以来该错误的累计发生次数，由 SDK 填充，默认 1 */
  count?: number;
  /** 本轮累计窗口内首次发生时间（count > 1 时上报） */
  firstTimestamp?: string;
  /** 本轮累计窗口内最后发生时间（count > 1 时上报） */
  lastTimestamp?: string;
}

/**
 * JavaScript 错误信息
 */
export interface JsErrorInfo extends BaseErrorInfo {
  errorType: "JavaScript Error" | "Unhandled Promise Rejection";
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string | null;
}

/**
 * 网络错误信息
 */
export interface NetworkErrorInfo extends BaseErrorInfo {
  errorType: "Fetch Error" | "XHR Error";
  method?: string;
  statusCode?: number;
  statusText?: string;
}

/**
 * 资源加载错误信息
 */
export interface ResourceErrorInfo extends BaseErrorInfo {
  errorType: "Resource Load Error";
  tagName: string;
  resourceUrl: string | null;
}

/**
 * WebSocket 错误信息
 */
export interface WebSocketErrorInfo extends BaseErrorInfo {
  errorType: "WebSocket Error";
  /** 连接地址 */
  target: string;
  /** 失败阶段：建立连接失败 / 连接期间异常 / 异常关闭 */
  phase: "connect" | "runtime" | "close";
  /** 异常关闭码（如 1006 连接异常断开、1015 TLS 握手失败） */
  closeCode?: number;
  /** 关闭原因 */
  closeReason?: string;
}

/**
 * EventSource (SSE) 错误信息
 */
export interface EventSourceErrorInfo extends BaseErrorInfo {
  errorType: "EventSource Error";
  /** 连接地址 */
  target: string;
  /** 连接中断（等待重连）或连接终止（不再重连） */
  phase: "connect" | "close";
  /** EventSource.readyState，2 表示已终止 */
  readyState?: number;
}

/**
 * 统一错误类型
 */
export type ErrorInfo =
  | JsErrorInfo
  | NetworkErrorInfo
  | ResourceErrorInfo
  | WebSocketErrorInfo
  | EventSourceErrorInfo;

/**
 * 内部配置（填充默认值后）
 */
export interface InternalConfig extends Required<
  Omit<ErrorMonitorConfig, "ignoreErrors" | "ignoreUrls" | "customData">
> {
  ignoreErrors: RegExp[];
  ignoreUrls: RegExp[];
  customData: Record<string, any>;
}
