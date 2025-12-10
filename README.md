# Error Monitor SDK

一个轻量级的前端错误监控 SDK，可以捕获 JavaScript 错误、Promise 异常、网络请求错误以及资源加载错误。

## 功能特性

- **JavaScript 错误监控**: 捕获未捕获的 JavaScript 错误 (`window.onerror`)。
- **Promise 异常监控**: 捕获未处理的 Promise 拒绝 (`window.onunhandledrejection`)。
- **网络错误监控**:
  - 拦截并监控 `XMLHttpRequest` 错误（包括超时）。
  - 拦截并监控 `fetch` API 错误。
- **资源加载错误监控**: 捕获资源（如图片、脚本、样式、视频、音频）加载失败的错误。
- **数据上报**: 优先使用 `navigator.sendBeacon` 进行可靠的数据上报，如果不支持则降级使用 `fetch`。
- **错误采样**: 支持配置采样率，避免高流量时上报过多错误。
- **错误去重**: 相同错误在 5 分钟内不会重复上报。
- **批量上报**: 支持错误队列，合并多个错误一次性上报，减少请求。
- **错误过滤**: 支持通过正则表达式忽略特定错误或 URL。
- **可销毁**: 支持停止监控并恢复原始状态。

## 安装

```bash
npm install error-monitor-sdk
```

## 使用方法

在你的应用入口文件（例如 `main.js` 或 `App.tsx`）中初始化 SDK。

```javascript
import { initErrorMonitor } from "error-monitor-sdk";

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

// 手动上报所有缓存的错误
monitor.flush();

// 停止监控（例如在单页应用切换用户时）
monitor.destroy();
```

## 配置项

`initErrorMonitor` 函数接受一个配置对象，包含以下属性：

| 属性名                | 类型       | 默认值 | 说明                                                         |
| --------------------- | ---------- | ------ | ------------------------------------------------------------ |
| `reportUrl`           | `string`   | -      | **必填**。错误数据将通过 POST 请求发送到的 URL 地址。        |
| `projectName`         | `string`   | -      | **必填**。用于标识错误来源的项目名称。                       |
| `environment`         | `string`   | -      | **必填**。当前运行环境（例如 'production', 'development'）。 |
| `sampleRate`          | `number`   | `1`    | 采样率，范围 0-1，1 表示 100% 上报。                         |
| `maxCacheSize`        | `number`   | `10`   | 错误缓存队列最大长度，达到后立即上报。                       |
| `reportDelay`         | `number`   | `2000` | 上报延迟时间（毫秒），用于合并错误批量上报。                 |
| `enableJsError`       | `boolean`  | `true` | 是否启用 JavaScript 错误监控。                               |
| `enableNetworkError`  | `boolean`  | `true` | 是否启用网络错误监控。                                       |
| `enableResourceError` | `boolean`  | `true` | 是否启用资源加载错误监控。                                   |
| `ignoreErrors`        | `RegExp[]` | `[]`   | 忽略的错误消息正则列表。                                     |
| `ignoreUrls`          | `RegExp[]` | `[]`   | 忽略的 URL 正则列表。                                        |
| `customData`          | `object`   | `{}`   | 自定义数据，会附加到每条错误记录中。                         |

## 返回值

`initErrorMonitor` 返回一个控制对象：

| 方法        | 说明                                         |
| ----------- | -------------------------------------------- |
| `flush()`   | 立即上报所有缓存中的错误。                   |
| `destroy()` | 停止所有监控，恢复原始状态，并上报剩余错误。 |

## 本地开发

1. **克隆仓库**

   ```bash
   git clone https://github.com/your-username/error-monitor.git
   cd error-monitor
   ```

2. **安装依赖**

   ```bash
   npm install
   ```

3. **运行开发服务器**

   ```bash
   npm run dev
   ```

4. **构建生产版本**

   ```bash
   npm run build
   ```

5. **运行演示 Demo**
   启动本地服务器以测试 SDK 功能。
   ```bash
   npm run demo
   ```
   然后在浏览器中打开 `http://localhost:3000`（或控制台显示的端口）查看演示。

## 许可证

MIT
