/** 页面输出：日志区与结果表格，供 runner 与压力测试共用 */
const logEl = document.getElementById("log");
const tbody = document.querySelector("#results tbody");
const summaryEl = document.getElementById("summary");

export const log = (message) => {
  logEl.textContent += `${new Date().toLocaleTimeString()}  ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

export const clearLog = () => {
  logEl.textContent = "";
};

export const clearRows = () => {
  tbody.innerHTML = "";
};

export const setSummary = (text, ok) => {
  summaryEl.textContent = text;
  summaryEl.className = ok ? "result-ok" : "result-fail";
};

export const renderRow = (name, expect, actual, ok, note) => {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${name}</td>
    <td>${expect}</td>
    <td>${actual}</td>
    <td class="${ok ? "result-ok" : "result-fail"}">${
      ok ? "✅ PASS" : "❌ FAIL"
    }</td>
    <td>${note || ""}</td>`;
  tbody.appendChild(row);
};

/** 跑一个客户端断言并渲染成一行，返回是否通过 */
export const renderClientCheck = async (check) => {
  let ok = false;
  let actual = "";
  let note = "";
  try {
    ok = await check.run();
    actual = check.describe ? await check.describe() : ok ? "正常" : "异常";
  } catch (error) {
    note = String(error);
  }
  renderRow(check.name, check.expect, actual, ok, note);
  return ok;
};
