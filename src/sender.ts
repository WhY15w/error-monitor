import { getBrowserInfo } from "./utils";
import type { ErrorInfo, InternalConfig } from "./types";

/** 错误缓存队列 */
let errorQueue: ErrorInfo[] = [];
/** 上报定时器 */
let reportTimer: ReturnType<typeof setTimeout> | null = null;
/** 已上报错误的指纹集合（用于去重） */
const reportedErrors = new Set<string>();
/** 当前配置 */
let currentConfig: InternalConfig | null = null;

/**
 * 设置 sender 配置
 */
export const setSenderConfig = (config: InternalConfig) => {
  currentConfig = config;
};

/**
 * 生成错误指纹用于去重
 */
const generateErrorFingerprint = (errorData: ErrorInfo): string => {
  return `${errorData.errorType}:${errorData.message}:${
    (errorData as any).source || ""
  }:${(errorData as any).lineno || ""}`;
};

/**
 * 检查是否应该采样上报此错误
 */
const shouldSample = (): boolean => {
  if (!currentConfig) return true;
  return Math.random() < currentConfig.sampleRate;
};

/**
 * 检查错误是否应该被忽略
 */
const shouldIgnore = (errorData: ErrorInfo): boolean => {
  if (!currentConfig) return false;

  // 检查是否匹配忽略的错误消息
  if (
    currentConfig.ignoreErrors.some((regex) => regex.test(errorData.message))
  ) {
    return true;
  }

  // 检查是否匹配忽略的 URL
  const url = (errorData as any).url || (errorData as any).source || "";
  if (url && currentConfig.ignoreUrls.some((regex) => regex.test(url))) {
    return true;
  }

  return false;
};

/**
 * 立即发送错误数据到指定 URL
 */
const sendImmediately = (data: ErrorInfo[], url: string) => {
  const browserInfo = getBrowserInfo();
  const dataToSend = data.map((item) => ({
    ...item,
    ...browserInfo,
    customData: currentConfig?.customData,
  }));

  // 批量上报，如果只有一条则直接发送对象，否则发送数组
  const payload = dataToSend.length === 1 ? dataToSend[0] : dataToSend;
  if (navigator.sendBeacon) {
    // 使用 text/plain 避免触发 CORS 预检请求
    // sendBeacon 不支持预检请求，application/json 会触发预检导致 CORS 错误
    const blob = new Blob([JSON.stringify(payload)], {
      type: "text/plain",
    });
    navigator.sendBeacon(url, blob);
  } else {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((error) => console.error("Error reporting failed:", error));
  }
};

/**
 * 刷新错误队列，立即上报所有缓存的错误
 */
export const flushErrorQueue = () => {
  if (!currentConfig || errorQueue.length === 0) return;

  sendImmediately([...errorQueue], currentConfig.reportUrl);
  errorQueue = [];

  if (reportTimer) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
};

/**
 * 发送错误数据
 * 支持采样、去重、批量上报
 *
 * @param {ErrorInfo} errorData - 要发送的错误数据对象
 * @param {string} url - 目标API端点URL
 */
export const sendErrorData = (errorData: ErrorInfo, url: string) => {
  // 采样检查
  if (!shouldSample()) {
    return;
  }

  // 忽略检查
  if (shouldIgnore(errorData)) {
    return;
  }

  // 去重检查（相同错误5分钟内不重复上报）
  const fingerprint = generateErrorFingerprint(errorData);
  if (reportedErrors.has(fingerprint)) {
    return;
  }
  reportedErrors.add(fingerprint);

  // 5分钟后从去重集合中移除
  setTimeout(() => {
    reportedErrors.delete(fingerprint);
  }, 5 * 60 * 1000);

  // 添加到队列
  errorQueue.push(errorData);

  // 如果达到最大缓存数量，立即上报
  if (currentConfig && errorQueue.length >= currentConfig.maxCacheSize) {
    flushErrorQueue();
    return;
  }

  // 否则延迟上报
  if (!reportTimer && currentConfig) {
    reportTimer = setTimeout(() => {
      flushErrorQueue();
    }, currentConfig.reportDelay);
  }
};

/**
 * 清理 sender 状态
 */
export const cleanupSender = () => {
  flushErrorQueue();
  reportedErrors.clear();
  currentConfig = null;
};
