# Error Monitor SDK

一个轻量级的前端错误监控 SDK，可以捕获 JavaScript 错误、Promise 异常、网络请求错误、资源加载错误以及 WebSocket / EventSource 连接异常。

## 功能特性

- **JavaScript 错误监控**: 捕获未捕获的 JavaScript 错误并从 ErrorEvent 中提取堆栈。
- **Promise 异常监控**: 捕获未处理的 Promise 拒绝，reason 不是 Error 时也能给出可读消息（字符串原样输出，对象序列化为 JSON）。
- **网络错误监控**:
  - 拦截并监控 `XMLHttpRequest` 错误（含超时）。
  - 拦截并监控 `fetch` API 错误。
- **资源加载错误监控**: 捕获 `img/script/link/video/audio/source/track/embed/object` 等资源加载失败。
- **实时连接监控**: 捕获 `WebSocket` 连接失败、异常断开（1006/1015）以及 `EventSource` 连接中断与终止。
- **数据上报**: 优先使用 `navigator.sendBeacon`，在返回 `false` 或不可用时降级为 `fetch`；单次负载超过 48KB 自动分片。
- **错误采样**: 支持配置采样率，避免高流量时上报过多错误。
- **去重与聚合**: 同一错误在去重窗口内只上报一次，窗口内的重复次数通过 `count` 字段累计，既不丢频次也不刷屏。
- **批量上报**: 支持错误队列，合并多个错误一次性上报，减少请求。
- **错误过滤**: 支持通过正则表达式忽略特定错误或 URL。
- **对业务零侵入**: 不覆盖 `window.onerror` / `window.onunhandledrejection`，不改变 `fetch` / `WebSocket` / `EventSource` 的原型与静态属性，异常不会抛给宿主应用。
- **可销毁**: 支持停止监控并恢复原始状态。

## 安装

```bash
pnpm install @yuyuqaq/error-monitor-sdk
```

## 使用方法

在你的应用入口文件（例如 `main.js` 或 `App.tsx`）中初始化 SDK。

```javascript
import { initErrorMonitor } from "@yuyuqaq/error-monitor-sdk";

const monitor = initErrorMonitor({
  reportUrl: "https://your-monitoring-server.com/api/report", // 错误上报接口
  projectName: "my-awesome-project", // 项目名称
  environment: "production", // 当前环境
  sampleRate: 0.5, // 采样率
  ignoreErrors: [/ResizeObserver loop/], // 忽略 ResizeObserver 相关错误
  ignoreUrls: [/localhost/, /127\.0\.0\.1/], // 忽略本地请求错误
  customData: {
    version: "1.0.0",
    userId: "user-123",
  },
});

// 手动上报所有缓存的错误（含被去重扣留的重复次数）
monitor.flush();

// 停止监控（例如在单页应用切换用户时）
monitor.destroy();
```

## 配置项

`initErrorMonitor` 函数接受一个配置对象，包含以下属性：

| 属性名                    | 类型       | 默认值   | 说明                                                         |
| ------------------------- | ---------- | -------- | ------------------------------------------------------------ |
| `reportUrl`               | `string`   | -        | **必填**。错误数据将通过 POST 请求发送到的 URL 地址。        |
| `projectName`             | `string`   | -        | **必填**。用于标识错误来源的项目名称。                       |
| `environment`             | `string`   | `unknown`| 当前运行环境（例如 'production', 'development'）。           |
| `sampleRate`              | `number`   | `1`      | 采样率，范围 0-1，1 表示 100% 上报，超出范围会被收敛。        |
| `maxCacheSize`            | `number`   | `10`     | 有未上报数据的错误数量上限，达到后立即上报（含仍在去重窗口内的累计次数）。 |
| `reportDelay`             | `number`   | `2000`   | 上报延迟时间（毫秒），用于合并错误批量上报。                 |
| `dedupeWindow`            | `number`   | `300000` | 相同错误的去重窗口（毫秒），窗口内的重复错误只累计 `count`。  |
| `maxStackLength`          | `number`   | `5000`   | 上报堆栈的最大长度，超出部分截断。                           |
| `enableJsError`           | `boolean`  | `true`   | 是否启用 JavaScript 错误监控。                               |
| `enableNetworkError`      | `boolean`  | `true`   | 是否启用网络错误监控。                                       |
| `enableResourceError`     | `boolean`  | `true`   | 是否启用资源加载错误监控。                                   |
| `enableWebSocketError`    | `boolean`  | `true`   | 是否启用 WebSocket 错误监控。                                |
| `enableEventSourceError`  | `boolean`  | `true`   | 是否启用 EventSource (SSE) 错误监控。                        |
| `ignoreErrors`            | `RegExp[]` | `[]`     | 忽略的错误消息正则列表（带 `g`/`y` 标志的正则同样安全）。     |
| `ignoreUrls`              | `RegExp[]` | `[]`     | 忽略的 URL 正则列表，会匹配请求地址、资源地址、脚本地址与页面地址。 |
| `customData`              | `object`   | `{}`     | 自定义数据，会附加到每条错误记录中。                         |

## 返回值

`initErrorMonitor` 返回一个控制对象：

| 方法        | 说明                                                     |
| ----------- | -------------------------------------------------------- |
| `flush()`   | 立即上报所有缓存中的错误（含仍被去重扣留的重复次数）。    |
| `destroy()` | 停止所有监控，上报剩余错误，并恢复所有被劫持的原始实现。 |

## 上报数据

每条错误记录都包含 `projectName`、`environment`、`errorType`、`timestamp`、`userAgent`、
`customData`，以及浏览器信息（`browserName`、`browserVersion`、`osName`、`osVersion`、
`deviceType`、`screenResolution`、`language`）。

同一错误在去重窗口内重复发生时，不会再发一条新记录，而是通过 `count` 字段累计次数，
并在 `count > 1` 时附带 `firstTimestamp` / `lastTimestamp`。`count` 是自上次上报以来该错误的
实际发生次数；上报模板取最近一次发生的数据，因此 `timestamp` 是本轮最后一次发生的时间：

```json
{
  "errorType": "JavaScript Error",
  "message": "Uncaught TypeError: Cannot read properties of undefined (reading 'id')",
  "source": "https://cdn.example.com/app.4f2a.js",
  "lineno": 12,
  "colno": 882,
  "count": 37,
  "firstTimestamp": "2026-10-16T10:00:00.000Z",
  "lastTimestamp": "2026-10-16T10:04:12.000Z"
}
```

不同错误类型会附带各自的定位信息：

| errorType                                     | 额外字段                                          |
| --------------------------------------------- | ------------------------------------------------- |
| `JavaScript Error`                            | `source`、`lineno`、`colno`、`stack`               |
| `Unhandled Promise Rejection`                 | `stack`                                           |
| `XHR Error` / `Fetch Error`                   | `method`、`url`、`statusCode`、`statusText`        |
| `Resource Load Error`                         | `tagName`、`resourceUrl`                           |
| `WebSocket Error`                             | `target`、`phase`、`closeCode`、`closeReason`      |
| `EventSource Error`                           | `target`、`phase`、`readyState`                    |

单条记录可能带多个错误对象（只有一条时是对象，多条时是数组），服务端需要同时兼容两种形状。

## 行为说明

这几点容易被误解，接入前建议了解：

- **主动取消的请求不算错误**：`AbortController` 取消的 `fetch`、XHR 的 `abort()` 都不会上报。
  超时（`AbortSignal.timeout()`、`xhr.timeout`）属于真实失败，会正常上报。
- **opaque 响应不上报**：`no-cors` 跨域请求的响应状态码为 0，无法判断成败，因此不产生上报。
- **SDK 自身的上报请求不会被监控**：`reportUrl` 按 `origin + pathname` 匹配，忽略 query/hash，
  因此相对路径和绝对路径写法都能正确跳过。
- **不覆盖业务钩子**：SDK 使用 `addEventListener` 监听错误，不替换 `window.onerror`；业务自定义的
  `window.onerror`（无论初始化前后设置）都会照常执行。
- **去重窗口内的重复错误不丢频次**：窗口内的重复只累计 `count`，窗口结束后再次发生才会带着
  新的 `count` 上报；`flush()`、页面隐藏与卸载时会把扣留的次数一并送出。
- **上报请求不会因额度耗尽而丢失**：降级用的 `fetch` 不带 `keepalive`，因为规范中 beacon 与
  keepalive 请求共用同一个 64KB 额度，beacon 被拒时 keepalive 必然同样失败。
- **游离资源元素无法捕获**：`new Image()` 这类未插入文档的元素，其 `error` 事件不会传播到
  `window`，任何基于全局监听的方案都收不到；图片需要插入文档后才能被监控。
- **跨域脚本需要 CORS**：未配置 `crossorigin` 的跨域脚本出错时只能拿到 `Script error.`，
  需要在脚本标签上加 `crossorigin` 并让 CDN 返回 `Access-Control-Allow-Origin`。

## 本地开发

1. **克隆仓库**

   ```bash
   git clone https://github.com/WhY15w/error-monitor.git
   cd error-monitor
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **监听构建**

   ```bash
   pnpm run dev
   ```

4. **构建生产版本**

   ```bash
   pnpm run build
   ```

5. **运行单元测试**

   覆盖聚合计数、采样与忽略规则、负载分片、地址匹配等逻辑：

   ```bash
   pnpm test
   ```

6. **运行靶场**

   启动本地服务后访问 `http://localhost:3000/index.html`：

   ```bash
   pnpm run demo
   ```

   页面提供手动触发按钮、「运行全部校验」（含 29 项断言，覆盖误报抑制、聚合计数、
   `destroy()` 恢复等）与「压力与边界」（2000 条同源错误、1200 条唯一错误、超长负载分片）。
   校验结果同时输出到页面表格和 `http://localhost:3000/__reports`。

## 许可证

MIT
