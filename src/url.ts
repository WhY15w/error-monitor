/**
 * 将 URL 解析为绝对地址，解析失败时原样返回
 */
export const resolveUrl = (url: unknown): string => {
  if (url === undefined || url === null || url === "") {
    return "";
  }

  const raw = typeof url === "string" ? url : String(url);
  try {
    const base = typeof location !== "undefined" ? location.href : undefined;
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
};

/**
 * 生成上报接口地址匹配器，用于跳过 SDK 自身请求
 * 匹配时忽略 query/hash，避免上报接口带参数时被重复监控
 */
export const createReportingUrlMatcher = (
  reportUrl: string,
): ((url: string) => boolean) => {
  const resolvedReportUrl = resolveUrl(reportUrl);
  let reportOrigin = "";
  let reportPathname = "";

  try {
    const parsed = new URL(resolvedReportUrl);
    reportOrigin = parsed.origin;
    reportPathname = parsed.pathname;
  } catch {
    // reportUrl 无法解析时仅做全等比较
  }

  return (url: string): boolean => {
    if (!url) return false;
    if (url === resolvedReportUrl) return true;
    if (!reportPathname) return false;

    try {
      const parsed = new URL(url);
      return (
        parsed.origin === reportOrigin && parsed.pathname === reportPathname
      );
    } catch {
      return false;
    }
  };
};
