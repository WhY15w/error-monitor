import {
  ctx,
  ensureMonitor,
  fetchReports,
  hasText,
  resetReports,
  sleep,
} from "./context.js";
import { log, renderRow } from "./ui.js";

const stressDuplicate = async () => {
  ensureMonitor();
  await resetReports();

  const start = performance.now();
  for (let i = 0; i < 2000; i++) {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "bench-dup",
        filename: "bench.js",
        lineno: 7,
      }),
    );
  }
  const elapsed = performance.now() - start;
  ctx.monitor.flush();
  await sleep(700);

  const items = (await fetchReports()).filter((r) =>
    hasText(r.message, "bench-dup"),
  );
  const count = items.reduce((sum, i) => sum + (i.count || 1), 0);
  log(
    `2000 条同源错误：处理耗时 ${elapsed.toFixed(1)}ms，上报 ${items.length} 条，累计 count=${count}`,
  );
  renderRow(
    "压力：2000 条同源错误聚合",
    "1 条 / count=2000",
    `${items.length} 条 / count=${count}`,
    items.length === 1 && count === 2000,
    `处理耗时 ${elapsed.toFixed(1)}ms`,
  );
};

const stressUnique = async () => {
  ensureMonitor();
  await resetReports();

  const start = performance.now();
  // 用 lineno 区分指纹，避免被归一化合并
  for (let i = 0; i < 1200; i++) {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "bench-uniq",
        filename: "bench.js",
        lineno: i,
      }),
    );
  }
  const elapsed = performance.now() - start;
  await sleep(1500);

  const items = (await fetchReports()).filter((r) =>
    hasText(r.message, "bench-uniq"),
  );
  const total = items.reduce((sum, i) => sum + (i.count || 1), 0);
  log(`1200 条唯一错误：处理耗时 ${elapsed.toFixed(1)}ms，上报 ${total} 条`);
  renderRow(
    "压力：1200 条唯一错误全部上报",
    "1200 条",
    `${total} 条`,
    total === 1200,
    `处理耗时 ${elapsed.toFixed(1)}ms`,
  );
};

const stressChunk = async () => {
  ensureMonitor();
  await resetReports();
  performance.clearResourceTimings();

  // 每条消息约 1.9KB，40 条约 76KB，超过 48KB 的单次负载上限
  const big = "x".repeat(1900);
  const beaconLog = [];
  const originalBeacon = Navigator.prototype.sendBeacon;

  // 记录每次 beacon 的负载与结果：用于观察分片以及 64KB 额度耗尽后的降级行为
  Navigator.prototype.sendBeacon = function (url, data) {
    const ok = originalBeacon.call(this, url, data);
    beaconLog.push(`${data.size}B:${ok ? "ok" : "refused"}`);
    return ok;
  };

  try {
    for (let i = 0; i < 40; i++) {
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: `bench-chunk-${big}`,
          filename: "chunk.js",
          lineno: i,
        }),
      );
    }
    ctx.monitor.flush();
    await sleep(2000);
  } finally {
    Navigator.prototype.sendBeacon = originalBeacon;
  }
  log(`chunk beacon 调用: ${beaconLog.join(" | ")}`);

  const requests = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/error-report"));
  log(
    `chunk 上报请求数: ${requests.length}（其中 ${
      requests.filter((entry) => entry.responseStatus === 200).length
    } 个成功）`,
  );

  const items = (await fetchReports()).filter((r) =>
    hasText(r.message, "bench-chunk"),
  );
  log(`40 条大负载错误：上报 ${items.length} 条`);
  renderRow(
    "压力：超长负载分片上报不丢数据",
    "40 条",
    `${items.length} 条`,
    items.length === 40,
    `beacon: ${beaconLog.join(" / ")}`,
  );
};

export const stress = {
  duplicate: stressDuplicate,
  unique: stressUnique,
  chunk: stressChunk,
};
