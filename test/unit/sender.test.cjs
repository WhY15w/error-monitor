/**
 * sender 的聚合上报行为校验
 * 运行：pnpm test（先用 tsconfig.test.json 编译 src，再用 node --test 跑这里的用例）
 */
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  setSenderConfig,
  sendErrorData,
  flushErrorQueue,
  cleanupSender,
} = require("./build/sender.js");

/** 捕获每次上报的负载，代替真实的 fetch / sendBeacon */
const requests = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 解析一次上报负载，单条是对象、多条是数组 */
const parsePayload = (body) => {
  const parsed = JSON.parse(body);
  return Array.isArray(parsed) ? parsed : [parsed];
};

const allItems = () => requests.flatMap((body) => parsePayload(body));
const counts = () => allItems().map((item) => item.count);

const configure = (overrides = {}) => {
  setSenderConfig({
    reportUrl: "http://localhost:3000/error-report",
    projectName: "test-project",
    environment: "test",
    sampleRate: 1,
    maxCacheSize: 100,
    reportDelay: 20,
    dedupeWindow: 50,
    maxStackLength: 5000,
    ignoreErrors: [],
    ignoreUrls: [],
    customData: { buildVersion: "test" },
    ...overrides,
  });
};

const jsError = (overrides = {}) => ({
  message: "boom",
  projectName: "test-project",
  environment: "test",
  errorType: "JavaScript Error",
  timestamp: new Date().toISOString(),
  userAgent: "test-agent",
  source: "http://localhost:3000/app.js",
  lineno: 1,
  url: "http://localhost:3000/",
  ...overrides,
});

beforeEach(() => {
  requests.length = 0;
  globalThis.fetch = (url, init) => {
    requests.push(init.body);
    return Promise.resolve({ ok: true });
  };
  configure();
});

afterEach(() => {
  cleanupSender();
  delete globalThis.fetch;
});

test("单条错误：count 为 1，并附带浏览器信息与 customData", async () => {
  sendErrorData(jsError());
  await sleep(60);

  assert.equal(requests.length, 1);
  const [item] = allItems();
  assert.equal(item.count, 1);
  assert.equal(item.message, "boom");
  assert.equal(item.errorType, "JavaScript Error");
  assert.ok(item.browserName);
  assert.equal(item.customData.buildVersion, "test");
});

test("同一批次内的重复错误聚合为一条", async () => {
  for (let i = 0; i < 3; i++) sendErrorData(jsError());
  flushErrorQueue(true);

  assert.equal(allItems().length, 1);
  assert.equal(allItems()[0].count, 3);
});

test("窗口内的重复错误只累计次数，不额外上报", async () => {
  // 窗口拉长到 500ms，保证下面的重复一定落在窗口内
  configure({ dedupeWindow: 500, reportDelay: 20 });

  // 首次上报
  sendErrorData(jsError());
  await sleep(80);
  assert.deepEqual(counts(), [1]);

  // 窗口内的两次重复：只累计，不触发上报
  sendErrorData(jsError());
  sendErrorData(jsError());
  await sleep(80);
  assert.deepEqual(counts(), [1], "窗口内的重复不应再产生上报");

  // force 上报把扣留的次数一并送出
  flushErrorQueue(true);
  assert.deepEqual(counts(), [1, 2]);
});

test("大量同源错误聚合为一条，count 等于实际发生次数", () => {
  for (let i = 0; i < 2000; i++) sendErrorData(jsError());
  flushErrorQueue(true);

  assert.equal(allItems().length, 1);
  assert.equal(allItems()[0].count, 2000);
});

test("第二轮累计上报的 count 等于本轮实际发生次数（不含幻影次数）", async () => {
  configure({ dedupeWindow: 150, reportDelay: 20 });

  // 第一轮
  sendErrorData(jsError());
  await sleep(80);
  assert.deepEqual(counts(), [1]);

  // 等去重窗口过期，再发生 3 次重复：窗口重新累计，count 应为 3
  await sleep(200);
  for (let i = 0; i < 3; i++) sendErrorData(jsError());
  await sleep(80);

  assert.deepEqual(counts(), [1, 3]);
  const second = allItems()[1];
  assert.ok(second.firstTimestamp, "count > 1 时应带出窗口起止时间");
  assert.ok(second.lastTimestamp);
});

test("上报后再次发生：新一轮从 count=1 重新开始", async () => {
  configure({ dedupeWindow: 150, reportDelay: 20 });

  sendErrorData(jsError());
  await sleep(80);
  await sleep(200);
  sendErrorData(jsError());
  await sleep(80);

  assert.deepEqual(counts(), [1, 1]);
});

test("不同错误各自独立计数", () => {
  sendErrorData(jsError({ lineno: 1 }));
  sendErrorData(jsError({ lineno: 2 }));
  sendErrorData(jsError({ lineno: 2 }));
  flushErrorQueue(true);

  assert.deepEqual(counts().sort(), [1, 2]);
});

test("采样率为 0 时不上报", () => {
  configure({ sampleRate: 0 });
  sendErrorData(jsError());
  flushErrorQueue(true);

  assert.equal(requests.length, 0);
});

test("ignoreErrors 命中时不上报", () => {
  configure({ ignoreErrors: [/ResizeObserver/] });
  sendErrorData(jsError({ message: "ResizeObserver loop limit exceeded" }));
  flushErrorQueue(true);

  assert.equal(requests.length, 0);
});

test("ignoreUrls 覆盖请求地址、资源地址、脚本地址与页面地址", () => {
  configure({ ignoreUrls: [/ignored-host/] });

  sendErrorData(
    jsError({ source: "http://ignored-host/app.js", message: "from-source" }),
  );
  sendErrorData(
    jsError({
      errorType: "Resource Load Error",
      tagName: "IMG",
      resourceUrl: "http://ignored-host/a.png",
      message: "from-resource",
    }),
  );
  sendErrorData(
    jsError({
      errorType: "XHR Error",
      method: "GET",
      url: "http://ignored-host/api",
      message: "from-request",
    }),
  );
  sendErrorData(
    jsError({
      errorType: "EventSource Error",
      target: "http://ignored-host/sse",
      phase: "connect",
      message: "from-target",
    }),
  );
  sendErrorData(jsError({ url: "http://ignored-host/page", message: "page" }));
  flushErrorQueue(true);

  assert.equal(requests.length, 0);
});

test("超出单次负载上限时切分上报且不丢数据", () => {
  const big = "x".repeat(1900);
  for (let i = 0; i < 40; i++) {
    sendErrorData(jsError({ message: big + i, lineno: i }));
  }
  flushErrorQueue(true);

  assert.ok(requests.length > 1, "应切分成多次请求");
  for (const body of requests) {
    assert.ok(body.length <= 48 * 1024, `单次负载 ${body.length} 超过上限`);
  }
  assert.equal(allItems().length, 40, "切分不应丢数据");
});

test("达到缓存上限时立即上报，不等 reportDelay", () => {
  configure({ maxCacheSize: 3, reportDelay: 10000 });
  for (let i = 0; i < 3; i++) {
    sendErrorData(jsError({ lineno: i }));
  }

  assert.equal(requests.length, 1, "缓存满时应立刻上报");
  assert.deepEqual(counts().sort(), [1, 1, 1]);
});

test("堆栈超长时截断", () => {
  configure({ maxStackLength: 200 });
  sendErrorData(jsError({ stack: "s".repeat(500) }));
  flushErrorQueue(true);

  const [item] = allItems();
  assert.ok(item.stack.startsWith("s".repeat(200)));
  assert.ok(item.stack.endsWith("[truncated]"));
});
