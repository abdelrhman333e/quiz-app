const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { parseQuestionFile } = require("../question-import");
const { exportQuestionFile } = require("../question-export");

test("parses labeled Arabic text questions with choices", async () => {
  const source = [
    "التصنيف: ثقافة عامة",
    "السؤال: ما عاصمة مصر؟",
    "الصعوبة: سهل",
    "الاختيار أ: القاهرة",
    "الاختيار ب: الإسكندرية",
    "الاختيار ج: الجيزة",
    "الاختيار د: الأقصر",
    "الإجابة: أ",
    "",
    "السؤال: ما لون السماء؟",
    "الإجابة: أزرق",
  ].join("\n");

  assert.deepEqual(
    await parseQuestionFile("txt", Buffer.from(source, "utf8")),
    [
      {
        t: "ثقافة عامة",
        x: "ما عاصمة مصر؟",
        d: "e",
        kind: "normal",
        o: ["القاهرة", "الإسكندرية", "الجيزة", "الأقصر"],
        c: 0,
        a: "",
      },
      {
        t: "عام",
        x: "ما لون السماء؟",
        d: "e",
        kind: "normal",
        o: [],
        c: -1,
        a: "أزرق",
      },
    ],
  );
});

test("parses XLSX columns and resolves the answer by matching its text", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questions");
  sheet.addRow([
    "التصنيف",
    "السؤال",
    "الصعوبة",
    "الاختيار أ",
    "الاختيار ب",
    "الاختيار ج",
    "الاختيار د",
    "الإجابة",
  ]);
  sheet.addRow([
    "علوم",
    "ما الغاز الذي نتنفسه؟",
    "صعب",
    "الأكسجين",
    "الهيليوم",
    "النيتروجين",
    "الهيدروجين",
    "الأكسجين",
  ]);

  const questions = await parseQuestionFile("xlsx", await workbook.xlsx.writeBuffer());
  assert.equal(questions.length, 1);
  assert.equal(questions[0].t, "علوم");
  assert.equal(questions[0].d, "h");
  assert.equal(questions[0].c, 0);
});

test("rejects incomplete multiple-choice rows with a location", async () => {
  const source = [
    "السؤال: سؤال تجريبي",
    "الاختيار أ: واحد",
    "الاختيار ب: اثنان",
    "الإجابة: أ",
  ].join("\n");

  await assert.rejects(
    parseQuestionFile("txt", Buffer.from(source, "utf8")),
    /السؤال عند السطر \d+: أدخل الاختيارات الأربعة/,
  );
});

test("exports TXT, XLSX and DOCX in formats that can be imported again", async () => {
  const questions = [
    {
      t: "علوم",
      x: "ما ناتج 2 + 2؟",
      d: "h",
      kind: "normal",
      o: ["3", "4", "5", "6"],
      c: 1,
      a: "",
    },
    {
      t: "ثقافة",
      x: "ما لون العشب؟",
      d: "e",
      kind: "normal",
      o: [],
      c: -1,
      a: "أخضر",
    },
  ];

  for (const format of ["txt", "xlsx", "docx"]) {
    const file = await exportQuestionFile(questions, format);
    const imported = await parseQuestionFile(format, file.data);
    assert.deepEqual(
      imported.map(({ t, x, d, o, c, a }) => ({ t, x, d, o, c, a })),
      questions.map(({ t, x, d, o, c, a }) => ({ t, x, d, o, c, a })),
    );
  }
});

test("exports no unsupported question kinds in exchange formats", async () => {
  await assert.rejects(
    exportQuestionFile([{ kind: "audio" }], "xlsx"),
    /استخدم JSON لتصدير جميع أنواع الأسئلة والصوت/,
  );
});
