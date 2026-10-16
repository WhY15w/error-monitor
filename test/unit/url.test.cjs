/**
 * 上报接口地址匹配器与地址解析
 * Node 里没有 location，先补一个，使相对地址按页面地址解析
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

globalThis.location = { href: "http://localhost:3000/app/index.html" };

const {
  resolveUrl,
  createReportingUrlMatcher,
} = require("./build/url.js");

test("resolveUrl 解析相对地址，非法地址原样返回", () => {
  assert.equal(resolveUrl(""), "");
  assert.equal(resolveUrl(null), "");
  assert.equal(resolveUrl("/api/report"), "http://localhost:3000/api/report");
  assert.equal(
    resolveUrl("api/report"),
    "http://localhost:3000/app/api/report",
  );
  assert.equal(resolveUrl("http://["), "http://[");
});

test("匹配器忽略 query 与 hash", () => {
  const isReportingUrl = createReportingUrlMatcher("/error-report");

  assert.equal(isReportingUrl("http://localhost:3000/error-report"), true);
  assert.equal(
    isReportingUrl("http://localhost:3000/error-report?fail=1"),
    true,
  );
  assert.equal(
    isReportingUrl("http://localhost:3000/error-report#section"),
    true,
  );
});

test("匹配器区分地址与来源", () => {
  const isReportingUrl = createReportingUrlMatcher("/error-report");

  assert.equal(isReportingUrl("http://localhost:3000/error-report-v2"), false);
  assert.equal(isReportingUrl("http://localhost:3000/api/error-report"), false);
  assert.equal(isReportingUrl("http://other-host/error-report"), false);
});

test("reportUrl 不可解析时仅做全等比较", () => {
  const isReportingUrl = createReportingUrlMatcher("http://[");

  assert.equal(isReportingUrl("http://["), true);
  assert.equal(isReportingUrl("http://localhost:3000/error-report"), false);
  assert.equal(isReportingUrl(""), false);
});
