const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const commonJs = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "common.js"),
  "utf8",
);
const tabletJs = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "tablet.js"),
  "utf8",
);

function createContext() {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        id,
        value: "",
        innerHTML: "",
        files: [],
        selectionStart: 0,
        focus() {},
        setSelectionRange() {},
      });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: {
      activeElement: null,
      body: { append() {} },
      documentElement: { dataset: { theme: "green" }, style: {} },
      getElementById: getElement,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      createElement: (tag) => ({
        tag,
        style: {},
        remove() {},
        setAttribute() {},
        append() {},
      }),
    },
    location: { origin: "http://localhost", pathname: "/tablet" },
    navigator: {},
    localStorage: { getItem: () => null, setItem() {} },
    fetch: () => new Promise(() => {}),
    EventSource: function () {
      this.addEventListener = () => {};
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    console,
    prompt: () => "",
  });
  vm.runInContext(commonJs, context);
  vm.runInContext(tabletJs, context);
  return context;
}

test("visual clarity reduces correct-answer points without going below zero", () => {
  const context = createContext();
  assert.equal(vm.runInContext("visualQuestionPoints('e', 0)", context), 1);
  assert.equal(vm.runInContext("visualQuestionPoints('e', 1)", context), 0);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 0)", context), 2);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 1)", context), 1);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 2)", context), 0);
  assert.equal(vm.runInContext("visualQuestionPoints('h', 8)", context), 0);
});

test("tablet renders a visual question using its own scoring helper", () => {
  const context = createContext();
  context.ME = { u: "test", room: "12345678" };
  context.G = {
    cs: [],
    cur: { id: "visual-1", q: 0, o: 0, a: 0, buz: null, res: null },
    f: "الكل",
    used: [],
    stats: { correct: 0, wrong: 0, deductedPoints: 0 },
    rounds: [],
    cardStatsMigrated: true,
    v: 1,
    mode: "free",
  };
  context.Qs = [
    {
      id: "visual-1",
      kind: "visual",
      image: "https://example.com/image.jpg",
      d: "h",
      x: "اختبار",
      a: "إجابة",
      t: "عام",
    },
  ];

  assert.doesNotThrow(() => vm.runInContext("render()", context));
  assert.match(context.document.getElementById("app").innerHTML, /2 نقطة متبقية/);
});
