/**
 * 错误监控配置接口
 */
export interface ErrorMonitorConfig {
  /** 上报错误的服务端地址 */
  reportUrl: string;
  /** 项目名称 */
  projectName: string;
  /** 当前环境，如 "production", "development" */
  environment: string;
  /** 采样率 0-1，默认 1（100%上报） */
  sampleRate?: number;
  /** 最大错误缓存数量，达到后批量上报，默认 10 */
  maxCacheSize?: number;
  /** 上报延迟时间(ms)，用于合并错误，默认 2000 */
  reportDelay?: number;
  /** 是否启用 JS 错误监控，默认 true */
  enableJsError?: boolean;
  /** 是否启用网络错误监控，默认 true */
  enableNetworkError?: boolean;
  /** 是否启用资源错误监控，默认 true */
  enableResourceError?: boolean;
  /** 忽略的错误消息正则列表 */
  ignoreErrors?: RegExp[];
  /** 忽略的 URL 正则列表 */
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
  url?: string;
  customData?: Record<string, any>;
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
  errorType: "Network Error" | "Fetch Error" | "XHR Error";
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
 * 统一错误类型
 */
export type ErrorInfo = JsErrorInfo | NetworkErrorInfo | ResourceErrorInfo;

/**
 * 内部配置（填充默认值后）
 */
export interface InternalConfig
  extends Required<
    Omit<ErrorMonitorConfig, "ignoreErrors" | "ignoreUrls" | "customData">
  > {
  ignoreErrors: RegExp[];
  ignoreUrls: RegExp[];
  customData: Record<string, any>;
}
