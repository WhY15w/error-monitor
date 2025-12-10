/**
 * 浏览器信息接口
 */
interface BrowserInfo {
  name: string;
  version: string;
}

/**
 * 获取浏览器信息
 * 解析 userAgent 获取浏览器名称和版本
 *
 * @returns {BrowserInfo} 包含浏览器名称和版本的对象
 */
export const getBrowserInfo = (): BrowserInfo => {
  const ua = navigator.userAgent;
  let tem: RegExpExecArray | null;

  // 检测 Edge (Chromium 版本)
  if (ua.includes("Edg/")) {
    const match = ua.match(/Edg\/(\d+)/);
    return { name: "Edge", version: match ? match[1] : "" };
  }

  // 检测 Opera
  if (ua.includes("OPR/")) {
    const match = ua.match(/OPR\/(\d+)/);
    return { name: "Opera", version: match ? match[1] : "" };
  }

  // 检测 Chrome
  if (ua.includes("Chrome/")) {
    const match = ua.match(/Chrome\/(\d+)/);
    return { name: "Chrome", version: match ? match[1] : "" };
  }

  // 检测 Safari
  if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    const match = ua.match(/Version\/(\d+)/);
    return { name: "Safari", version: match ? match[1] : "" };
  }

  // 检测 Firefox
  if (ua.includes("Firefox/")) {
    const match = ua.match(/Firefox\/(\d+)/);
    return { name: "Firefox", version: match ? match[1] : "" };
  }

  // 检测 IE
  if (ua.includes("MSIE") || ua.includes("Trident/")) {
    if (ua.includes("MSIE")) {
      const match = ua.match(/MSIE (\d+)/);
      return { name: "IE", version: match ? match[1] : "" };
    }
    tem = /\brv[ :]+(\d+)/g.exec(ua);
    return { name: "IE", version: tem ? tem[1] : "" };
  }

  return { name: "Unknown", version: "" };
};
