import type { InternalConfig } from "./types";

/**
 * 每条错误记录都携带的公共字段
 *
 * url 的语义随错误类型不同：网络错误上是出错请求的地址，其余类型上是页面地址，
 * 因此由各监控模块自行补充，不在这里统一生成
 */
export const errorEnvelope = (config: InternalConfig) => ({
  projectName: config.projectName,
  environment: config.environment,
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
});
