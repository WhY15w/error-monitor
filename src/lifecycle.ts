import { safeRun } from "./utils";
import type { InternalConfig } from "./types";

/**
 * 统一的监控模块生命周期
 *
 * install 负责挂载监听并返回卸载函数。卸载后挂在业务对象上的监听（例如已经发送过的
 * XHR 实例）仍可能触发，需要用 isActive() 判断是否还要上报
 */
export const createMonitor = (
  name: string,
  install: (config: InternalConfig, isActive: () => boolean) => () => void,
) => {
  let teardown: (() => void) | null = null;

  return {
    start: (config: InternalConfig): void => {
      if (teardown) {
        console.warn(`[ErrorMonitor] ${name} is already initialized`);
        return;
      }

      safeRun(() => {
        teardown = install(config, () => teardown !== null);
      });
    },

    stop: (): void => {
      const uninstall = teardown;
      if (!uninstall) return;

      teardown = null;
      safeRun(uninstall);
    },
  };
};
