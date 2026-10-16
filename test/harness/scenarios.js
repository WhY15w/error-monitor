import { ctx, sleep } from "./context.js";

/** 同一行抛出两次，用于验证去重聚合（两次都在 reportDelay 窗口内） */
export function throwSameLine() {
  throw new Error("test-js-error-same-line");
}

export const scenarios = {
  jsDuplicate: async () => {
    setTimeout(throwSameLine, 0);
    setTimeout(throwSameLine, 0);
    await sleep(500);
  },
  rejectionReasons: async () => {
    Promise.reject("test-reject-string");
    Promise.reject({ code: 500, detail: "test-reject-object" });
    await sleep(300);
  },
  ignoredErrors: async () => {
    setTimeout(() => {
      throw new Error("ResizeObserver loop limit exceeded");
    }, 0);
    fetch("http://localhost:9999/ignored-by-config/probe");
    await sleep(400);
  },
  xhr: async () => {
    const dead = new XMLHttpRequest();
    dead.open("GET", "http://localhost:9999/xhr-dead");
    dead.send();

    const server = new XMLHttpRequest();
    server.open("GET", "/api/500");
    server.send();

    // 超时：应上报 XHR Timeout
    const slow = new XMLHttpRequest();
    slow.open("GET", "/api/slow");
    slow.timeout = 300;
    slow.send();

    // 同一实例重复 open：只应上报最后一次请求
    const reopened = new XMLHttpRequest();
    reopened.open("GET", "http://localhost:9999/xhr-reopen-first");
    reopened.open("GET", "http://localhost:9999/xhr-reopen-second");
    reopened.send();

    await sleep(800);
  },
  fetchCases: async () => {
    fetch("http://localhost:9999/fetch-dead");

    // 主动取消：不应上报
    const controller = new AbortController();
    fetch("/api/slow", { signal: controller.signal }).catch(() => {});
    setTimeout(() => controller.abort(), 50);

    // opaque 响应（跨域 no-cors）：status 为 0，不应上报
    fetch("http://127.0.0.1:3000/api/404", { mode: "no-cors" }).catch(() => {});

    fetch("/api/500");

    // SDK 自身的上报接口（相对路径）：即使返回 500 也不应被监控
    fetch("/error-report?fail=1", { method: "POST", body: "probe" });

    await sleep(900);
  },
  resources: async () => {
    // 注意：资源元素必须插入文档，游离元素上的 error 事件不会传播到 window
    const img = new Image();
    img.src = "/404-image.png";
    document.body.appendChild(img);

    const script = document.createElement("script");
    script.src = "/404-script.js";
    document.head.appendChild(script);

    const object = document.createElement("object");
    object.type = "application/pdf";
    object.data = "/404-object.pdf";
    document.body.appendChild(object);

    await sleep(900);
  },
  realtime: async () => {
    // 连接失败（端口未监听）
    const dead = new WebSocket("ws://localhost:9999/ws-dead");
    dead.onerror = () => {};

    // 握手完成后被服务端异常断开
    const abrupt = new WebSocket("ws://localhost:9998/abrupt");
    abrupt.onerror = () => {};

    // SSE 致命错误（204）
    const fatal = new EventSource("/sse-fatal");
    fatal.onerror = () => {};

    // SSE 自动重连：会产生多次 error，应聚合为一条并累计次数
    const retry = new EventSource("/sse-retry");
    retry.onerror = () => {};
    setTimeout(() => retry.close(), 2200);

    await sleep(2600);
  },
  beaconFallback: async () => {
    // sendBeacon 返回 false（队列满/负载超限）时必须降级 fetch，否则数据被静默丢弃
    const originalBeacon = Navigator.prototype.sendBeacon;
    Navigator.prototype.sendBeacon = () => false;
    try {
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "bench-beacon-fallback",
          filename: "bench.js",
          lineno: 99,
        }),
      );
      ctx.monitor.flush();
      await sleep(800);
    } finally {
      Navigator.prototype.sendBeacon = originalBeacon;
    }
  },
};
