import { ctx } from "./context.js";
import { runAll } from "./runner.js";
import { throwSameLine } from "./scenarios.js";
import { stress } from "./stress.js";
import { log } from "./ui.js";

// 场景与压力测试通过 ctx 输出到页面日志区
ctx.log = log;

const throwInSameTick = (fn) => setTimeout(fn, 0);

const manual = {
  "btn-js": () => throwInSameTick(throwSameLine),
  "btn-promise": () => Promise.reject(new Error("手动触发的 Promise 错误")),
  "btn-xhr": () => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "http://localhost:9999/not-exist");
    xhr.send();
  },
  "btn-fetch": () => fetch("http://localhost:9999/not-exist"),
  "btn-fetch-abort": () => {
    const controller = new AbortController();
    fetch("/api/slow", { signal: controller.signal }).catch(() => {});
    setTimeout(() => controller.abort(), 30);
  },
  "btn-fetch-opaque": () =>
    fetch("http://127.0.0.1:3000/api/404", { mode: "no-cors" }).catch(() => {}),
  "btn-resource": () => {
    const img = new Image();
    img.src = "/404-image.png";
    document.body.appendChild(img);
  },
  "btn-ws": () => {
    const socket = new WebSocket("ws://localhost:9999/not-exist");
    socket.onerror = () => {};
  },
  "btn-ws-abrupt": () => {
    const socket = new WebSocket("ws://localhost:9998/abrupt");
    socket.onerror = () => {};
  },
  "btn-sse": () => {
    const source = new EventSource("/sse-fatal");
    source.onerror = () => {};
  },
  "btn-ignored": () =>
    throwInSameTick(() => {
      throw new Error("ResizeObserver loop limit exceeded");
    }),
};

for (const [id, handler] of Object.entries(manual)) {
  document.getElementById(id).onclick = () => {
    log(`手动触发: ${id}`);
    handler();
  };
}

document.getElementById("btn-run").onclick = runAll;
document.getElementById("btn-stress-dup").onclick = stress.duplicate;
document.getElementById("btn-stress-uniq").onclick = stress.unique;
document.getElementById("btn-stress-chunk").onclick = stress.chunk;
