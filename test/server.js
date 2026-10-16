import express from "express";
import cors from "cors";
import crypto from "crypto";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

/** 已收到的上报记录，用于自动化校验 */
const receivedReports = [];

app.use(cors());
app.use(express.json());
app.use(express.text());

// 静态资源服务：让浏览器能访问到 dist 目录下的 SDK
app.use("/dist", express.static(path.join(__dirname, "../dist")));
app.use(express.static(__dirname));

// 接收错误上报的接口
app.post("/error-report", (req, res) => {
  // ?fail=1 用于验证「SDK 自身的请求不会被监控」
  if (req.query.fail === "1") {
    res.status(500).send("intentional failure");
    return;
  }

  let body = req.body;
  // 如果是 sendBeacon 发来的，通常是 text/plain，尝试解析 JSON
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.warn("无法解析上报数据:", body);
    }
  }

  const items = Array.isArray(body) ? body : [body];
  // 记录送达通道：beacon 为 text/plain，降级 fetch 为 application/json
  const receivedVia = (req.headers["content-type"] || "").includes(
    "application/json",
  )
    ? "fetch"
    : "beacon";

  for (const item of items) {
    receivedReports.push({ ...item, _receivedVia: receivedVia, receivedAt: Date.now() });
  }

  console.log(
    `\n🚨 ================= 收到错误上报 (${items.length} 条) ================= 🚨`,
  );
  console.log(JSON.stringify(body, null, 2));
  console.log("-----------------------------------------------------\n");
  res.status(200).send("ok");
});

// 查询 / 清空已收到的上报数据（供自动化校验使用）
app.get("/__reports", (req, res) => {
  res.json(receivedReports);
});

app.get("/__reset", (req, res) => {
  receivedReports.length = 0;
  res.json({ ok: true });
});

// 各类测试接口
app.get("/api/ok", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/500", (req, res) => {
  res.status(500).send("server error");
});

app.get("/api/404", (req, res) => {
  res.status(404).send("not found");
});

app.get("/api/slow", (req, res) => {
  setTimeout(() => res.json({ ok: true }), 3000);
});

// SSE：返回 204 让客户端视为致命错误，不再重连
app.get("/sse-fatal", (req, res) => {
  res.status(204).end();
});

// SSE：正常建连后立即断开，并告知客户端 400ms 后重连
app.get("/sse-retry", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 400\n");
  res.write("data: hello\n\n");
  setTimeout(() => res.end(), 120);
});

app.listen(port, () => {
  console.log(`\n🚀 测试服务已启动！`);
  console.log(`👉 请访问: http://localhost:${port}/index.html\n`);
});

/**
 * WebSocket 测试服务（9998 端口）
 * - /abrupt：完成握手后 300ms 异常断开（客户端收到 1006）
 * - 其它：握手前直接断开
 */
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

net
  .createServer((socket) => {
    let buffer = "";
    socket.on("error", () => {});

    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      if (!buffer.includes("\r\n\r\n")) return;

      const requestLine = buffer.split("\r\n")[0] || "";
      if (!requestLine.includes("/abrupt")) {
        socket.destroy();
        return;
      }

      const key = /Sec-WebSocket-Key: (.+)\r\n/i.exec(buffer)?.[1]?.trim();
      if (!key) {
        socket.destroy();
        return;
      }

      const accept = crypto
        .createHash("sha1")
        .update(key + WS_GUID)
        .digest("base64");

      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );

      // 握手完成后异常断开，不发送关闭帧
      setTimeout(() => socket.destroy(), 300);
    });
  })
  .listen(9998, () => {
    console.log("🔌 WebSocket 测试服务已启动: ws://localhost:9998");
  });
