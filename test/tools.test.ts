import assert from "node:assert/strict";
import test from "node:test";
import { createTools } from "../src/tools";

test("calculator evaluates arithmetic", async () => {
  const calculator = createTools().calculator;
  assert.equal(await calculator.run({ expression: "847 * 23" }), "19481");
  assert.equal(await calculator.run({ expression: "(45 + 55) * 3" }), "300");
});

test("calculator rejects non-arithmetic input", async () => {
  const calculator = createTools().calculator;
  await assert.rejects(calculator.run({ expression: "process.exit()" }), /unsupported characters/);
});

test("read_file blocks path traversal", async () => {
  const readFileTool = createTools().read_file;
  await assert.rejects(readFileTool.run({ path: "../package.json" }), /escapes fixtures/);
});

test("read_file reports a missing file", async () => {
  const readFileTool = createTools().read_file;
  await assert.rejects(readFileTool.run({ path: "settings.json" }), /file not found/);
});

test("flaky search fails once, then succeeds", async () => {
  const search = createTools().search_docs;
  await assert.rejects(search.run({ query: "rate limit" }), /temporary search index error/);
  assert.match(await search.run({ query: "rate limit" }), /429/);
});
