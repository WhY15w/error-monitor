import {
  NativeES,
  NativeFetch,
  NativeWS,
  NativeXhrOpen,
  config,
  ctx,
  fetchReports,
  hasText,
  resetReports,
  sleep,
} from "./context.js";
import { clientChecks, expectations } from "./expectations.js";
import { scenarios } from "./scenarios.js";
import {
  clearLog,
  clearRows,
  log,
  renderClientCheck,
  renderRow,
  setSummary,
} from "./ui.js";

/** 从固定的一行抛出错误，保证两轮错误的指纹一致 */
const throwFromSameLine = () => {
  setTimeout(() => {
    throw new Error("test-two-cycle");
  }, 0);
};

/** 轮询上报结果，直到凑齐预期条数或超时（后台标签页里 beacon 可能延迟送达） */
const collectReports = async (predicate, minCount, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const items = (await fetchReports()).filter(predicate);
    if (items.length >= minCount || Date.now() >= deadline) {
      return items;
    }
    await sleep(200);
  }
};

/**
 * 两轮累计校验
 *
 * 用短窗口连跑两轮：第一轮上报 count=1，窗口过期后的 3 次重复应上报 count=3。
 * 若把首轮模板再算一次（历史上的 +1 算法），这里会报出 4
 */
const checkAggregationCycles = async () => {
  await resetReports();

  if (!ctx.monitorDestroyed) {
    ctx.monitor.destroy();
    ctx.monitorDestroyed = true;
  }

  const monitor = ErrorMonitor.initErrorMonitor({
    ...config,
    reportDelay: 120,
    dedupeWindow: 400,
    maxCacheSize: 100,
  });
  ctx.monitor = monitor;
  ctx.monitorDestroyed = false;

  // 强制走 fetch 通道：后台标签页里 beacon 队列会延迟送达，导致这里读到空结果
  const originalBeacon = Navigator.prototype.sendBeacon;
  Navigator.prototype.sendBeacon = () => false;

  let items = [];
  try {
    throwFromSameLine();
    await sleep(700); // 等首次上报，并让去重窗口过期

    throwFromSameLine();
    throwFromSameLine();
    throwFromSameLine();

    items = await collectReports(
      (r) => hasText(r.message, "test-two-cycle"),
      2,
    );
  } finally {
    Navigator.prototype.sendBeacon = originalBeacon;
  }

  const counts = items.map((item) => item.count).join(",");

  monitor.destroy();
  ctx.monitorDestroyed = true;

  const ok = counts === "1,3";
  renderRow(
    "两轮累计：count 与本轮实际发生次数一致",
    "1,3",
    `${items.length} 条 / count=${counts}`,
    ok,
    "短窗口下连跑两轮，避免首轮数据被重复计入",
  );
  return ok;
};

export const runAll = async () => {
  const runButton = document.getElementById("btn-run");
  runButton.disabled = true;
  clearRows();
  clearLog();
  setSummary("运行中...", true);
  let passed = 0;
  let failed = 0;

  try {
    await resetReports();
    log("已清空服务端上报记录");

    for (const [name, run] of Object.entries(scenarios)) {
      log(`触发场景: ${name}`);
      await run();
    }

    log("触发业务自定义 onerror 场景");
    setTimeout(() => {
      throw new Error("test-app-onerror-chain");
    }, 0);
    await sleep(500);

    // 最终上报：带出仍在去重窗口内、已扣留的重复次数
    ctx.monitor.flush();
    log("已调用 monitor.flush()");
    await sleep(800);

    const reports = await fetchReports();
    log(`服务端共收到 ${reports.length} 条上报记录`);

    for (const expectation of expectations) {
      const items = expectation.select(reports);
      const ok = expectation.ok(items);
      const note = expectation.describe ? expectation.describe(items) : "";
      renderRow(
        expectation.name,
        expectation.expect,
        `${items.length} 条`,
        ok,
        note,
      );
      ok ? passed++ : failed++;
    }

    for (const check of clientChecks) {
      (await renderClientCheck(check)) ? passed++ : failed++;
    }

    // destroy 后应恢复原生实现且不再上报
    ctx.monitor.destroy();
    ctx.monitorDestroyed = true;
    const restored =
      window.WebSocket === NativeWS &&
      window.EventSource === NativeES &&
      window.fetch === NativeFetch &&
      XMLHttpRequest.prototype.open === NativeXhrOpen;
    renderRow(
      "destroy() 恢复原生实现",
      "全部还原",
      restored
        ? "已还原"
        : `WS:${window.WebSocket === NativeWS} ES:${
            window.EventSource === NativeES
          } fetch:${window.fetch === NativeFetch} XHR:${
            XMLHttpRequest.prototype.open === NativeXhrOpen
          }`,
      restored,
      "",
    );
    restored ? passed++ : failed++;

    fetch("http://localhost:9999/after-destroy");
    setTimeout(() => {
      throw new Error("test-after-destroy");
    }, 0);
    await sleep(400);

    const afterDestroy = await fetchReports();
    const leaked = afterDestroy.some(
      (r) =>
        hasText(r.url, "after-destroy") ||
        hasText(r.message, "test-after-destroy"),
    );
    renderRow(
      "destroy() 后不再上报",
      "0 条",
      leaked ? "仍有上报" : "0 条",
      !leaked,
      "",
    );
    !leaked ? passed++ : failed++;

    (await checkAggregationCycles()) ? passed++ : failed++;

    setSummary(`校验完成：${passed} 项通过，${failed} 项失败`, failed === 0);
    log(`全部校验结束：通过 ${passed}，失败 ${failed}`);
  } catch (error) {
    log(`运行异常: ${error}`);
  } finally {
    runButton.disabled = false;
  }
};
