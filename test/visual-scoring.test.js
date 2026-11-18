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
    playSfx: () => {},
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

test("visual questions stay clear unless blur is selected", () => {
  const context = createContext();
  const game = {
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
  const questions = [
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
  vm.runInContext(
    `ME = ${JSON.stringify({ u: "test", room: "12345678" })}; G = ${JSON.stringify(game)}; Qs = ${JSON.stringify(questions)};`,
    context,
  );

  assert.doesNotThrow(() => vm.runInContext("render()", context));
  const markup = context.document.getElementById("app").innerHTML;
  assert.match(markup, /filter:blur\(0px\)/);
  assert.match(markup, />2 نقطة</);
  assert.doesNotMatch(markup, /وضّح أكتر/);
});

test("selected visual questions use the clarity step and remaining points", () => {
  const context = createContext();
  const game = {
    cs: [],
    cur: {
      id: "visual-1",
      q: 0,
      o: 0,
      a: 0,
      buz: null,
      res: null,
      visualClarity: 1,
    },
    f: "الكل",
    used: [],
    stats: { correct: 0, wrong: 0, deductedPoints: 0 },
    rounds: [],
    cardStatsMigrated: true,
    v: 1,
    mode: "free",
  };
  const questions = [
    {
      id: "visual-1",
      kind: "visual",
      image: "https://example.com/image.jpg",
      blurEnabled: true,
      d: "h",
      x: "اختبار",
      a: "إجابة",
      t: "عام",
    },
  ];
  vm.runInContext(
    `ME = ${JSON.stringify({ u: "test", room: "12345678" })}; G = ${JSON.stringify(game)}; Qs = ${JSON.stringify(questions)};`,
    context,
  );

  assert.doesNotThrow(() => vm.runInContext("render()", context));
  const markup = context.document.getElementById("app").innerHTML;
  assert.match(markup, /filter:blur\(19\.2px\)/);
  assert.match(markup, /1 نقطة متبقية/);
});

test("showing a manually selected question activates a fresh buzzer round", () => {
  const context = createContext();
  vm.runInContext(
    `G = ${JSON.stringify({
      cs: [],
      cur: { id: "q1", q: 0, o: 0, a: 0, buz: null, res: null, displayId: null },
      f: "الكل",
      used: ["q1"],
      stats: { correct: 0, wrong: 0, deductedPoints: 0 },
      rounds: [],
      cardStatsMigrated: true,
      v: 1,
      mode: "free",
    })}; Qs = ${JSON.stringify([
      {
        id: "q1",
        kind: "normal",
        d: "e",
        x: "اختبار",
        a: "إجابة",
        t: "عام",
        o: [],
      },
    ])}; ME = ${JSON.stringify({ u: "test", room: "12345678" })};`,
    context,
  );

  vm.runInContext("tg('q')", context);
  assert.equal(vm.runInContext("G.cur.q", context), 1);
  assert.match(String(vm.runInContext("G.cur.displayId", context)), /^\d+-/);
  assert.equal(vm.runInContext("G.cur.buz", context), null);

  vm.runInContext("G.cur.buz = 0; G.cur.res = 'ok'; tg('q')", context);
  assert.equal(vm.runInContext("G.cur.q", context), 0);
  assert.equal(vm.runInContext("G.cur.displayId", context), null);
  assert.equal(vm.runInContext("G.cur.buz", context), null);
});

test("tablet statistics render the requested groups and controls", () => {
  const context = createContext();
  const game = {
    cs: [
      {
        id: "player-1",
        n: "المتسابق",
        s: 7,
        correct: 2,
        wrong: 1,
        deductedPoints: 2,
        categoryStats: [],
      },
    ],
    cur: { id: null, q: 0, o: 0, a: 0, buz: null, res: null },
    f: "الكل",
    used: [],
    stats: { correct: 2, wrong: 1, deductedPoints: 2 },
    rounds: [],
    cardStatsMigrated: true,
    v: 1,
    mode: "free",
    showStats: false,
  };
  vm.runInContext(
    `ME = ${JSON.stringify({ u: "test", room: "12345678" })}; G = ${JSON.stringify(game)}; Qs = []; showStats();`,
    context,
  );
  const markup = context.document.getElementById("statsModal").innerHTML;
  assert.match(markup, /stats-primary-grid/);
  assert.match(markup, /stats-secondary-grid/);
  assert.match(markup, /stats-podium/);
  assert.match(markup, /stats-progress/);
  assert.equal((markup.match(/stats-podium-spacer/g) || []).length, 2);
  assert.match(markup, /toggleStatsOnScreen\(\)/);
  assert.match(markup, /resetStats\(\)/);
  assert.match(markup, /إجابات صحيحة/);
  assert.doesNotMatch(markup, /🏆|📊/);
});
