import {
  NativeWS,
  NativeWSPrototype,
  hasText,
  isAppOnErrorCalled,
  isSentinelOnError,
} from "./context.js";

const filterReports = (reports, predicate) => reports.filter(predicate);

export const expectations = [
  {
    name: "JS 错误同行两次合并为一条",
    expect: "count 合计 2 / ≤2 条",
    describe: (items) => {
      const total = items.reduce((sum, i) => sum + (i.count || 1), 0);
      if (total !== 2) return `count 合计=${total}`;
      if (!items[0].stack) return "缺少 stack";
      if (items[0].errorType !== "JavaScript Error")
        return `errorType=${items[0].errorType}`;
      return items.length === 1
        ? "1 条 count=2"
        : `${items.length} 条（中途页面隐藏，按批次拆开）`;
    },
    select: (reports) =>
      filterReports(reports, (r) =>
        hasText(r.message, "test-js-error-same-line"),
      ),
    // 页面隐藏会触发一次 force 上报（这是设计行为），此时同一错误会按批次拆成两条
    ok: (items) => {
      const total = items.reduce((sum, i) => sum + (i.count || 1), 0);
      return total === 2 && items.length >= 1 && items.length <= 2;
    },
  },
  {
    name: "字符串 rejection 原因可读",
    expect: "1 条 / message 原样",
    select: (reports) =>
      filterReports(reports, (r) => r.message === "test-reject-string"),
    ok: (items) =>
      items.length === 1 &&
      items[0].errorType === "Unhandled Promise Rejection",
  },
  {
    name: "对象 rejection 原因可读（非 [object Object]）",
    expect: "1 条 / 含 detail",
    select: (reports) =>
      filterReports(reports, (r) =>
        hasText(r.message, '"detail":"test-reject-object"'),
      ),
    ok: (items) => items.length === 1,
  },
  {
    name: "命中 ignoreErrors 不上报",
    expect: "0 条",
    select: (reports) =>
      filterReports(reports, (r) =>
        hasText(r.message, "ResizeObserver loop"),
      ),
    ok: (items) => items.length === 0,
  },
  {
    name: "命中 ignoreUrls 不上报",
    expect: "0 条",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.url, "ignored-by-config")),
    ok: (items) => items.length === 0,
  },
  {
    name: "XHR 网络失败上报",
    expect: "1 条 / XHR Error",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.url, "xhr-dead")),
    ok: (items) =>
      items.length === 1 && items[0].errorType === "XHR Error",
  },
  {
    name: "XHR 500 带状态码",
    expect: "1 条 / 500",
    select: (reports) =>
      filterReports(
        reports,
        (r) => hasText(r.url, "/api/500") && r.errorType === "XHR Error",
      ),
    ok: (items) =>
      items.length === 1 &&
      items[0].statusCode === 500 &&
      items[0].method === "GET",
  },
  {
    name: "XHR 超时上报",
    expect: "1 条 / XHR Timeout",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.message, "XHR Timeout")),
    ok: (items) => items.length === 1 && items[0].errorType === "XHR Error",
  },
  {
    name: "XHR 重复 open 只上报最后一次",
    expect: "second=1 / first=0",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.url, "xhr-reopen-")),
    ok: (items) =>
      items.length === 1 && hasText(items[0].url, "xhr-reopen-second"),
  },
  {
    name: "Fetch 网络失败上报",
    expect: "1 条 / Fetch Error",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.url, "fetch-dead")),
    ok: (items) =>
      items.length === 1 && items[0].errorType === "Fetch Error",
  },
  {
    name: "Fetch 主动取消不上报",
    expect: "0 条",
    select: (reports) =>
      filterReports(
        reports,
        (r) => r.errorType === "Fetch Error" && hasText(r.url, "/api/slow"),
      ),
    ok: (items) => items.length === 0,
  },
  {
    name: "Fetch opaque 响应不上报",
    expect: "0 条",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.url, "127.0.0.1")),
    ok: (items) => items.length === 0,
  },
  {
    name: "Fetch 500 带状态码",
    expect: "1 条 / 500",
    select: (reports) =>
      filterReports(
        reports,
        (r) => hasText(r.url, "/api/500") && r.errorType === "Fetch Error",
      ),
    ok: (items) => items.length === 1 && items[0].statusCode === 500,
  },
  {
    name: "SDK 自身上报接口请求不上报",
    expect: "0 条",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.url, "/error-report")),
    ok: (items) => items.length === 0,
  },
  {
    name: "资源加载失败 (IMG)",
    expect: "1 条 / IMG",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.resourceUrl, "404-image.png")),
    ok: (items) => items.length === 1 && items[0].tagName === "IMG",
  },
  {
    name: "资源加载失败 (SCRIPT)",
    expect: "1 条 / SCRIPT",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.resourceUrl, "404-script.js")),
    ok: (items) => items.length === 1 && items[0].tagName === "SCRIPT",
  },
  {
    name: "资源加载失败 (OBJECT)",
    expect: "1 条 / OBJECT",
    select: (reports) =>
      filterReports(reports, (r) => hasText(r.resourceUrl, "404-object.pdf")),
    ok: (items) => items.length === 1 && items[0].tagName === "OBJECT",
  },
  {
    name: "WebSocket 连接失败上报",
    expect: "1 条 / phase=connect",
    select: (reports) =>
      filterReports(
        reports,
        (r) =>
          r.errorType === "WebSocket Error" && hasText(r.target, "ws-dead"),
      ),
    ok: (items) => items.length === 1 && items[0].phase === "connect",
  },
  {
    name: "WebSocket 异常断开上报（不重复）",
    expect: "1 条",
    select: (reports) =>
      filterReports(
        reports,
        (r) =>
          r.errorType === "WebSocket Error" &&
          hasText(r.target, "9998/abrupt"),
      ),
    ok: (items) => items.length === 1,
  },
  {
    name: "SSE 致命错误上报",
    expect: "1 条 / readyState=2",
    select: (reports) =>
      filterReports(
        reports,
        (r) =>
          r.errorType === "EventSource Error" &&
          hasText(r.target, "/sse-fatal"),
      ),
    ok: (items) =>
      items.length === 1 &&
      items[0].readyState === 2 &&
      items[0].phase === "close",
  },
  {
    name: "SSE 自动重连聚合计数",
    expect: "≤3 条 / 累计次数≥2",
    select: (reports) =>
      filterReports(
        reports,
        (r) =>
          r.errorType === "EventSource Error" &&
          hasText(r.target, "/sse-retry"),
      ),
    ok: (items) => {
      const total = items.reduce((sum, i) => sum + (i.count || 1), 0);
      return items.length >= 1 && items.length <= 3 && total >= 2;
    },
  },
  {
    name: "sendBeacon 失败时降级 fetch",
    expect: "1 条 / 经 fetch 送达",
    select: (reports) =>
      filterReports(reports, (r) =>
        hasText(r.message, "bench-beacon-fallback"),
      ),
    ok: (items) =>
      items.length === 1 && items[0]._receivedVia === "fetch",
  },
  {
    name: "上报数据带浏览器信息与 customData",
    expect: "全部记录",
    select: (reports) => reports,
    ok: (items) =>
      items.length > 0 &&
      items.every(
        (r) =>
          r.browserName &&
          r.projectName === "Test-Playground" &&
          r.customData?.buildVersion === "test-1" &&
          typeof r.count === "number",
      ),
  },
];

export const clientChecks = [
  {
    name: "SDK 未覆盖业务 window.onerror",
    expect: "哨兵保留",
    run: () => isSentinelOnError(),
    describe: () => (isSentinelOnError() ? "保留" : "被覆盖"),
  },
  {
    name: "初始化后业务自定义 onerror 仍生效",
    expect: "被调用 + 已上报",
    run: () => isAppOnErrorCalled(),
    describe: () => (isAppOnErrorCalled() ? "已调用" : "未调用"),
  },
  {
    name: "WebSocket 兼容性",
    expect: "原型/常量/instanceof",
    run: () => {
      const socket = new NativeWS("ws://localhost:9999/probe");
      socket.onerror = () => {};
      try {
        return (
          WebSocket.prototype === NativeWSPrototype &&
          WebSocket.OPEN === 1 &&
          WebSocket.CONNECTING === 0 &&
          WebSocket.CLOSED === 3 &&
          socket instanceof WebSocket &&
          socket instanceof NativeWS
        );
      } finally {
        socket.close();
      }
    },
  },
];
