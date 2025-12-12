/**
 * 浏览器信息接口
 */
interface BrowserInfo {
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  deviceType: string;
  screenResolution: string;
  language: string;
}

/**
 * 获取浏览器名称和版本
 */
const getBrowserNameAndVersion = (
  ua: string
): { name: string; version: string } => {
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
    const tem = /\brv[ :]+(\d+)/g.exec(ua);
    return { name: "IE", version: tem ? tem[1] : "" };
  }

  return { name: "Unknown", version: "" };
};

/**
 * 获取操作系统名称和版本
 */
const getOSInfo = (ua: string): { name: string; version: string } => {
  // Windows
  if (ua.includes("Windows")) {
    const match = ua.match(/Windows NT (\d+\. ?\d*)/);
    const versionMap: Record<string, string> = {
      "10.0": "10/11",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
      "6.0": "Vista",
      "5.1": "XP",
    };
    const ntVersion = match ? match[1] : "";
    return { name: "Windows", version: versionMap[ntVersion] || ntVersion };
  }

  // macOS
  if (ua.includes("Mac OS X")) {
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    const version = match ? match[1].replace(/_/g, ".") : "";
    return { name: "macOS", version };
  }

  // iOS
  if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")) {
    const match = ua.match(/OS (\d+[._]\d+[._]?\d*)/);
    const version = match ? match[1].replace(/_/g, ".") : "";
    return { name: "iOS", version };
  }

  // Android
  if (ua.includes("Android")) {
    const match = ua.match(/Android (\d+\. ?\d*\. ?\d*)/);
    return { name: "Android", version: match ? match[1] : "" };
  }

  // Linux
  if (ua.includes("Linux")) {
    return { name: "Linux", version: "" };
  }

  return { name: "Unknown", version: "" };
};

/**
 * 获取设备类型
 */
const getDeviceType = (ua: string): string => {
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return "Tablet";
  }
  if (
    /mobile|iphone|ipod|android.*mobile|windows.*phone|blackberry/i.test(ua)
  ) {
    return "Mobile";
  }
  return "Desktop";
};

/**
 * 获取屏幕分辨率
 */
const getScreenResolution = (): string => {
  if (typeof window !== "undefined" && window.screen) {
    return `${window.screen.width}x${window.screen.height}`;
  }
  return "";
};

/**
 * 获取浏览器语言
 */
const getLanguage = (): string => {
  if (typeof navigator !== "undefined") {
    return navigator.language || (navigator as any).userLanguage || "";
  }
  return "";
};

/**
 * 获取完整的浏览器信息
 * 解析 userAgent 获取浏览器、操作系统、设备等信息
 *
 * @returns {BrowserInfo} 包含完整浏览器信息的对象
 */
export const getBrowserInfo = (): BrowserInfo => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  const browser = getBrowserNameAndVersion(ua);
  const os = getOSInfo(ua);

  return {
    browserName: browser.name,
    browserVersion: browser.version,
    osName: os.name,
    osVersion: os.version,
    deviceType: getDeviceType(ua),
    screenResolution: getScreenResolution(),
    language: getLanguage(),
  };
};
