/**
 * 浏览器信息接口
 */
export interface BrowserInfo {
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
  ua: string,
): { name: string; version: string } => {
  const rules: Array<[RegExp, string]> = [
    // 注意顺序：先匹配厂商自有标识，再匹配内核标识
    [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/MicroMessenger\/(\d+)/, "WeChat"],
    [/HuaweiBrowser\/(\d+)/, "Huawei Browser"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/FxiOS\/(\d+)/, "Firefox"],
    // Android WebView 的 UA 同时包含 Version/ 与 Chrome/，需先于两者判断
    [/; wv\).*Chrome\/(\d+)/, "Android WebView"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Version\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari\//, "Safari"],
  ];

  for (const [pattern, name] of rules) {
    const match = ua.match(pattern);
    if (match) {
      return { name, version: match[1] };
    }
  }

  // 检测 IE
  if (ua.includes("MSIE") || ua.includes("Trident/")) {
    const match = ua.match(/MSIE (\d+)/) || ua.match(/\brv[ :]+(\d+)/);
    return { name: "IE", version: match ? match[1] : "" };
  }

  return { name: "Unknown", version: "" };
};

/**
 * 获取操作系统名称和版本
 */
const getOSInfo = (ua: string): { name: string; version: string } => {
  const windowsVersionMap: Record<string, string> = {
    "10.0": "10/11",
    "6.3": "8.1",
    "6.2": "8",
    "6.1": "7",
    "6.0": "Vista",
    "5.1": "XP",
  };

  const matchVersion = (pattern: RegExp): string => {
    const match = ua.match(pattern);
    return match ? match[1] : "";
  };

  if (/Windows/.test(ua)) {
    const ntVersion = matchVersion(/Windows NT ([\d.]+)/);
    return {
      name: "Windows",
      version: windowsVersionMap[ntVersion] || ntVersion,
    };
  }

  if (/iPhone|iPad|iPod/.test(ua)) {
    return {
      name: "iOS",
      version: matchVersion(/OS ([\d._]+)/).replace(/_/g, "."),
    };
  }

  // iPadOS 13+ 默认使用 Macintosh UA，只能靠触点数区分
  if (/Mac OS X/.test(ua)) {
    if (
      /Macintosh/.test(ua) &&
      typeof navigator !== "undefined" &&
      (navigator.maxTouchPoints ?? 0) > 1
    ) {
      return {
        name: "iPadOS",
        version: matchVersion(/OS ([\d._]+)/).replace(/_/g, "."),
      };
    }
    return {
      name: "macOS",
      version: matchVersion(/Mac OS X ([\d._]+)/).replace(/_/g, "."),
    };
  }

  if (/HarmonyOS/.test(ua)) {
    return { name: "HarmonyOS", version: matchVersion(/HarmonyOS[ /]([\d.]+)/) };
  }

  if (/Android/.test(ua)) {
    return { name: "Android", version: matchVersion(/Android ([\d.]+)/) };
  }

  if (/Linux/.test(ua)) {
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

/** 浏览器信息缓存，同一页面生命周期内不需要重复解析 UA */
let cachedBrowserInfo: BrowserInfo | null = null;

/**
 * 获取完整的浏览器信息
 * 解析 userAgent 获取浏览器、操作系统、设备等信息，结果会被缓存
 *
 * @returns {BrowserInfo} 包含完整浏览器信息的对象
 */
export const getBrowserInfo = (): BrowserInfo => {
  if (cachedBrowserInfo) {
    return cachedBrowserInfo;
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = getBrowserNameAndVersion(ua);
  const os = getOSInfo(ua);

  cachedBrowserInfo = {
    browserName: browser.name,
    browserVersion: browser.version,
    osName: os.name,
    osVersion: os.version,
    deviceType: getDeviceType(ua),
    screenResolution: getScreenResolution(),
    language: getLanguage(),
  };

  return cachedBrowserInfo;
};
