import { getBrowserInfo } from "./userAgent";
import { safeRun } from "./utils";
import type { ErrorInfo, InternalConfig } from "./types";

/** 去重表中的一条记录 */
interface SeenEntry {
  /** 自上次上报以来累计的发生次数，0 表示没有待上报的数据 */
  pending: number;
  /** 上次上报时间，0 表示从未上报（此时任何一次上报都视为已过去重窗口） */
  lastReportedAt: number;
  /** 本轮累计窗口内首次发生时间，pending > 0 时有效 */
  firstAt: number;
  /** 本轮累计窗口内最后发生时间，pending > 0 时有效 */
  lastAt: number;
  /**
   * 待上报数据的模板，取最近一次发生的数据；pending 归零后释放，
   * 避免去重表长期持有堆栈等大字段
   */
  template: ErrorInfo | null;
}

/** 有未上报数据的记录：pending > 0 时 template 必然存在 */
type PendingEntry = SeenEntry & { template: ErrorInfo };

/** 去重表容量上限，避免错误量极大时内存无界增长 */
const MAX_TRACKED_FINGERPRINTS = 1000;
/**
 * 单次请求的负载上限
 * 规范对 beacon 队列与 keepalive 请求共用 64KB 额度，留出余量后取 48KB
 */
const MAX_PAYLOAD_SIZE = 48 * 1024;
/** 单条错误消息最大长度 */
const MAX_MESSAGE_LENGTH = 2000;

/** 去重表：fingerprint -> 记录 */
const seen = new Map<string, SeenEntry>();
/** 有未上报数据的指纹数量，用于判断是否达到缓存上限 */
let awaitingCount = 0;
/** 上报定时器 */
let reportTimer: ReturnType<typeof setTimeout> | null = null;
/** 当前配置 */
let currentConfig: InternalConfig | null = null;

/**
 * 设置 sender 配置
 */
export const setSenderConfig = (config: InternalConfig) => {
  currentConfig = config;
};

/** 截断过长字符串 */
const truncateString = (value: string, maxLength: number): string => {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [truncated]`;
};

/**
 * 安全执行正则匹配
 * 带 g/y 标志的正则是带状态的，直接 test 会因 lastIndex 造成漏判，此处统一复位
 */
const testRegex = (regex: RegExp, value: string): boolean => {
  if (!value) return false;
  regex.lastIndex = 0;
  const matched = regex.test(value);
  regex.lastIndex = 0;
  return matched;
};

/**
 * 归一化错误消息，用于生成去重指纹
 * 去掉其中的动态数据（URL、数字、uuid 等），避免同一条错误因参数不同而被反复上报
 */
const normalizeMessage = (message: string): string => {
  return message
    .replace(/https?:\/\/[^\s'")]+/gi, "<url>")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<uuid>",
    )
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
};

/**
 * 生成错误指纹用于去重
 * JS 错误的消息里常带有动态数据，需先归一化；网络/资源类错误的地址本身有区分度，直接使用
 */
const generateErrorFingerprint = (errorData: ErrorInfo): string => {
  switch (errorData.errorType) {
    case "JavaScript Error":
    case "Unhandled Promise Rejection":
      return `${errorData.errorType}:${errorData.source ?? ""}:${
        errorData.lineno ?? ""
      }:${normalizeMessage(errorData.message)}`;
    // 同一地址的连接失败、连接期间异常与异常关闭是不同的故障，分别计数
    case "WebSocket Error":
      return `${errorData.errorType}:${errorData.target}:${errorData.phase}:${
        errorData.closeCode ?? ""
      }`;
    case "EventSource Error":
      return `${errorData.errorType}:${errorData.target}:${errorData.phase}`;
    default:
      return `${errorData.errorType}:${errorData.message}`;
  }
};

/**
 * 一条错误涉及的所有地址，用于 ignoreUrls 匹配
 */
const errorUrls = (errorData: ErrorInfo): string[] => {
  const urls: Array<string | null | undefined> = [errorData.url];

  switch (errorData.errorType) {
    case "JavaScript Error":
      urls.push(errorData.source);
      break;
    case "Resource Load Error":
      urls.push(errorData.resourceUrl);
      break;
    case "WebSocket Error":
    case "EventSource Error":
      urls.push(errorData.target);
      break;
    case "Unhandled Promise Rejection":
    case "XHR Error":
    case "Fetch Error":
      break;
  }

  return urls.filter(
    (value): value is string => typeof value === "string" && value !== "",
  );
};

/**
 * 检查是否应该采样上报此错误
 */
const shouldSample = (config: InternalConfig): boolean => {
  return config.sampleRate >= 1 || Math.random() < config.sampleRate;
};

/**
 * 检查错误是否应该被忽略
 */
const shouldIgnore = (errorData: ErrorInfo, config: InternalConfig): boolean => {
  if (
    config.ignoreErrors.length > 0 &&
    config.ignoreErrors.some((regex) => testRegex(regex, errorData.message))
  ) {
    return true;
  }

  if (config.ignoreUrls.length === 0) {
    return false;
  }

  return errorUrls(errorData).some((url) =>
    config.ignoreUrls.some((regex) => testRegex(regex, url)),
  );
};

/**
 * 收敛单条错误的数据量，避免超长堆栈撑爆上报负载
 */
const normalizeErrorData = (
  errorData: ErrorInfo,
  config: InternalConfig,
): ErrorInfo => {
  const data: ErrorInfo = {
    ...errorData,
    message: truncateString(errorData.message, MAX_MESSAGE_LENGTH),
  };

  if (
    (data.errorType === "JavaScript Error" ||
      data.errorType === "Unhandled Promise Rejection") &&
    data.stack
  ) {
    data.stack = truncateString(data.stack, config.maxStackLength);
  }

  return data;
};

/**
 * 去重表超限时清理最旧的、没有待上报数据的记录
 */
const evictTrackedEntries = () => {
  if (seen.size <= MAX_TRACKED_FINGERPRINTS) return;

  for (const [key, entry] of seen) {
    if (seen.size <= MAX_TRACKED_FINGERPRINTS) break;
    if (entry.pending === 0) {
      seen.delete(key);
    }
  }
};

/**
 * 判断一条记录是否该在本次上报中送出：有累计次数，且从未上报或去重窗口已过
 * force 表示忽略去重窗口（页面卸载、手动 flush、缓存已满）
 */
const isDue = (
  entry: SeenEntry,
  now: number,
  dedupeWindow: number,
  force: boolean,
): entry is PendingEntry =>
  entry.pending > 0 &&
  entry.template !== null &&
  (force || now - entry.lastReportedAt >= dedupeWindow);

/**
 * 安排上报：待上报的数据达到缓存上限时立即上报，否则延迟合并上报
 */
const scheduleFlush = (config: InternalConfig) => {
  if (awaitingCount >= config.maxCacheSize) {
    flushErrorQueue(true);
    return;
  }

  if (!reportTimer) {
    reportTimer = setTimeout(() => flushErrorQueue(), config.reportDelay);
  }
};

/**
 * 把待上报记录转换成上报数据
 */
const toPayloadItem = (entry: PendingEntry): ErrorInfo => {
  const item: ErrorInfo = { ...entry.template, count: entry.pending };

  if (entry.pending > 1) {
    item.firstTimestamp = new Date(entry.firstAt).toISOString();
    item.lastTimestamp = new Date(entry.lastAt).toISOString();
  }

  return item;
};

/**
 * 上报成功后复位记录，使窗口内的重复重新开始累计
 */
const commitReport = (entry: SeenEntry, now: number) => {
  entry.pending = 0;
  entry.lastReportedAt = now;
  entry.firstAt = 0;
  entry.lastAt = 0;
  entry.template = null;
  awaitingCount -= 1;
};

/**
 * 发送单批数据：优先 sendBeacon，失败或不可用时降级为 fetch
 *
 * 降级请求不能带 keepalive：规范里 beacon 与 keepalive 请求共用同一个 64KB 在途额度，
 * beacon 因额度不足返回 false 时，keepalive 请求必然同样被拒绝（Failed to fetch）
 */
const transmit = (payload: string, url: string) => {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    // 使用 text/plain 避免触发 CORS 预检请求
    const blob = new Blob([payload], { type: "text/plain" });
    // sendBeacon 在负载超限或队列已满时会返回 false，此时必须降级上报，否则数据被静默丢弃
    if (navigator.sendBeacon(url, blob)) {
      return;
    }
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  }).catch((error) => {
    console.warn("[ErrorMonitor] Error reporting failed:", error);
  });
};

/**
 * 序列化并上报，超过单次负载上限时切分成多批
 */
const sendPayload = (items: ErrorInfo[], config: InternalConfig) => {
  // 浏览器信息与自定义数据在发送时统一附加
  const browserInfo = getBrowserInfo();
  const serialized = items.map((item) =>
    JSON.stringify({
      ...item,
      ...browserInfo,
      customData: config.customData,
    }),
  );

  let batch: string[] = [];
  let batchSize = 2; // 空数组 "[]" 的长度

  const flushBatch = () => {
    if (batch.length === 0) return;
    transmit(
      batch.length === 1 ? batch[0] : `[${batch.join(",")}]`,
      config.reportUrl,
    );
    batch = [];
    batchSize = 2;
  };

  for (const json of serialized) {
    const itemSize = json.length + 1;
    if (batch.length > 0 && batchSize + itemSize > MAX_PAYLOAD_SIZE) {
      flushBatch();
    }
    batch.push(json);
    batchSize += itemSize;
  }

  flushBatch();
};

/**
 * 刷新错误队列，立即上报到期的错误
 *
 * @param {boolean} force - 是否忽略去重窗口。页面卸载、手动 flush 与缓存已满时
 * 需要把仍在窗口内、已扣留的重复次数一并送出
 */
export const flushErrorQueue = (force = false): void => {
  safeRun(() => {
    if (reportTimer) {
      clearTimeout(reportTimer);
      reportTimer = null;
    }

    const config = currentConfig;
    if (!config) return;

    const now = Date.now();
    const due: PendingEntry[] = [];
    for (const entry of seen.values()) {
      if (isDue(entry, now, config.dedupeWindow, force)) {
        due.push(entry);
      }
    }

    if (due.length === 0) return;

    // 先送出、成功后再复位：发送过程中抛错时这批数据仍留在表里，等下一次上报
    sendPayload(
      due.map((entry) => toPayloadItem(entry)),
      config,
    );
    for (const entry of due) {
      commitReport(entry, now);
    }
  });
};

/**
 * 发送错误数据
 * 支持采样、过滤、去重与聚合上报
 *
 * @param {ErrorInfo} errorData - 要发送的错误数据对象
 */
export const sendErrorData = (errorData: ErrorInfo): void => {
  safeRun(() => {
    const config = currentConfig;
    if (!config) return;

    if (!shouldSample(config)) return;
    if (shouldIgnore(errorData, config)) return;

    const data = normalizeErrorData(errorData, config);
    const fingerprint = generateErrorFingerprint(data);
    const now = Date.now();
    const entry = seen.get(fingerprint);

    if (!entry) {
      seen.set(fingerprint, {
        pending: 1,
        lastReportedAt: 0,
        firstAt: now,
        lastAt: now,
        template: data,
      });
      awaitingCount += 1;
      evictTrackedEntries();
      scheduleFlush(config);
      return;
    }

    // 重复发生：累计次数，并用最近一次的数据作为上报模板
    if (entry.pending === 0) {
      entry.firstAt = now;
      awaitingCount += 1;
    }
    entry.pending += 1;
    entry.lastAt = now;
    entry.template = data;

    // 去重窗口已过，安排一次上报把这批累计次数送出去
    if (now - entry.lastReportedAt >= config.dedupeWindow) {
      scheduleFlush(config);
    }
  });
};

/**
 * 清理 sender 状态；最终上报由 destroyErrorMonitor 负责
 */
export const cleanupSender = () => {
  seen.clear();
  awaitingCount = 0;
  if (reportTimer) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
  currentConfig = null;
};
