const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const commonJs = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "common.js"),
  "utf8",
);
const context = vm.createContext({});
vm.runInContext(commonJs, context);

test("visual clarity reduces correct-answer points without going below zero", () => {
  assert.equal(vm.runInContext("visualQuestionPoints('e', 0)", context), 1);
  assert.equal(vm.runInContext("visualQuestionPoints('e', 1)", context), 0);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 0)", context), 2);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 1)", context), 1);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 2)", context), 0);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 8)", context), 0);
});
