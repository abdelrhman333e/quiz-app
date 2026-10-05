const ExcelJS = require("exceljs");
const mammoth = require("mammoth");

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, "");

const headerNames = new Map();
for (const [name, aliases] of Object.entries({
  category: ["التصنيف", "الفئة", "النوع", "category", "type"],
  question: ["السؤال", "question"],
  difficulty: ["الصعوبة", "المستوى", "difficulty", "level"],
  optionA: ["الاختيار أ", "اختيار أ", "أ", "option a", "optiona", "a"],
  optionB: ["الاختيار ب", "اختيار ب", "ب", "option b", "optionb", "b"],
  optionC: ["الاختيار ج", "اختيار ج", "ج", "option c", "optionc", "c"],
  optionD: ["الاختيار د", "اختيار د", "د", "option d", "optiond", "d"],
  answer: ["الإجابة", "الاجابة", "الصحيح", "answer", "correct answer"],
}))
  for (const alias of aliases) headerNames.set(normalize(alias), name);

function canonicalHeader(value) {
  return headerNames.get(normalize(value));
}

function cellText(cell) {
  let value = cell?.value;
  if (value && typeof value === "object") {
    if ("result" in value) value = value.result;
    else if ("text" in value) value = value.text;
    else if (Array.isArray(value.richText))
      value = value.richText.map((part) => part.text).join("");
  }
  return value == null ? "" : String(value).trim();
}

function parseTableRows(rows) {
  if (!rows.length) throw new Error("الملف لا يحتوي على أسئلة");
  const headers = rows[0].map(canonicalHeader);
  if (!headers.includes("question"))
    throw new Error("لم أجد عمود «السؤال» في الصف الأول");
  const records = [];
  for (let index = 1; index < rows.length; index++) {
    const values = rows[index];
    if (!values) continue;
    if (!values.some((value) => String(value ?? "").trim())) continue;
    const record = {};
    headers.forEach((header, column) => {
      if (header) record[header] = values[column] ?? "";
    });
    records.push({ ...record, source: `الصف ${index + 1}` });
  }
  return records;
}

function parseLabeledText(text) {
  const labels = new Map(
    [
      ["التصنيف", "category"],
      ["الفئة", "category"],
      ["النوع", "category"],
      ["category", "category"],
      ["type", "category"],
      ["السؤال", "question"],
      ["question", "question"],
      ["الصعوبة", "difficulty"],
      ["المستوى", "difficulty"],
      ["difficulty", "difficulty"],
      ["level", "difficulty"],
      ["الاختيارا", "optionA"],
      ["اختيارا", "optionA"],
      ["ا", "optionA"],
      ["optiona", "optionA"],
      ["الاختيارب", "optionB"],
      ["اختيارب", "optionB"],
      ["ب", "optionB"],
      ["optionb", "optionB"],
      ["الاختيارج", "optionC"],
      ["اختيارج", "optionC"],
      ["ج", "optionC"],
      ["optionc", "optionC"],
      ["الاختيارد", "optionD"],
      ["اختيارد", "optionD"],
      ["د", "optionD"],
      ["optiond", "optionD"],
      ["الاجابة", "answer"],
      ["الصحيح", "answer"],
      ["answer", "answer"],
      ["correct answer", "answer"],
    ].map(([label, field]) => [normalize(label), field]),
  );
  const records = [];
  let record = {},
    lastField = null,
    lineNumber = 0;
  const commit = () => {
    if (record.question)
      records.push({
        ...record,
        source: record.source || `السطر ${lineNumber}`,
      });
    record = {};
    lastField = null;
  };
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    lineNumber++;
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([^:：]+)\s*[:：]\s*(.*)$/.exec(line);
    if (!match) {
      if (lastField && record[lastField])
        record[lastField] += ` ${line}`;
      else
        throw new Error(`تنسيق غير معروف في السطر ${lineNumber}: أضف اسم الحقل ثم نقطتين`);
      continue;
    }
    const field = labels.get(normalize(match[1]));
    if (!field)
      throw new Error(`اسم حقل غير معروف في السطر ${lineNumber}: ${match[1]}`);
    if (field === "question" && record.question) commit();
    record[field] = match[2].trim();
    if (field === "question")
      record.source = `السؤال عند السطر ${lineNumber}`;
    lastField = field;
  }
  commit();
  if (!records.length)
    throw new Error("لم أجد أسئلة؛ استخدم أسطرًا معنونة مثل «السؤال: نص السؤال»");
  return records;
}

function buildQuestion(record) {
  const question = String(record.question ?? "").trim(),
    category = String(record.category ?? "").trim() || "عام",
    difficultyText = normalize(record.difficulty ?? ""),
    options = ["optionA", "optionB", "optionC", "optionD"].map((key) =>
      String(record[key] ?? "").trim(),
    ),
    answer = String(record.answer ?? "").trim(),
    filledOptions = options.filter(Boolean).length;

  if (!question || !answer)
    throw new Error(`${record.source}: السؤال أو الإجابة فارغة`);
  if (category.length > 40 || question.length > 500 || answer.length > 300)
    throw new Error(`${record.source}: تجاوز أحد الحقول الحد الأقصى للطول`);
  if (options.some((option) => option.length > 200))
    throw new Error(`${record.source}: يجب ألا يتجاوز طول الاختيار 200 حرف`);
  if (filledOptions !== 0 && filledOptions !== 4)
    throw new Error(`${record.source}: أدخل الاختيارات الأربعة كلها أو اتركها فارغة`);

  let difficulty = "e";
  if (["صعب", "الصعب", "hard", "h", "2"].includes(difficultyText))
    difficulty = "h";
  else if (
    difficultyText &&
    !["سهل", "السهل", "easy", "e", "1"].includes(difficultyText)
  )
    throw new Error(`${record.source}: الصعوبة يجب أن تكون «سهل» أو «صعب»`);

  let correct = -1;
  if (filledOptions) {
    const answerKey = normalize(answer).replace(/^الاختيار/, "");
    const letterIndex = new Map([
      ["ا", 0],
      ["a", 0],
      ["1", 0],
      ["ب", 1],
      ["b", 1],
      ["2", 1],
      ["ج", 2],
      ["c", 2],
      ["3", 2],
      ["د", 3],
      ["d", 3],
      ["optiona", 0],
      ["optionb", 1],
      ["optionc", 2],
      ["optiond", 3],
      ["4", 3],
    ]);
    correct = letterIndex.has(answerKey)
      ? letterIndex.get(answerKey)
      : options.findIndex((option) => normalize(option) === normalize(answer));
    if (correct < 0)
      throw new Error(`${record.source}: الإجابة يجب أن تطابق اختيارًا أو حرفه (أ/ب/ج/د)`);
  }

  return {
    t: category,
    x: question,
    d: difficulty,
    kind: "normal",
    o: filledOptions ? options : [],
    c: correct,
    a: filledOptions ? "" : answer,
  };
}

async function parseQuestionFile(extension, data) {
  let records;
  if (extension === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("ملف Excel لا يحتوي على ورقة عمل");
    if (sheet.rowCount > 10001)
      throw new Error("تحتوي ورقة Excel على صفوف كثيرة جدًا؛ الحد الأقصى 500 سؤال");
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows[row.number - 1] = row.values.slice(1).map((_, index) =>
        cellText(row.getCell(index + 1)),
      );
    });
    records = parseTableRows(rows);
  } else if (extension === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: data });
    records = parseLabeledText(value);
  } else if (extension === "txt") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    records = parseLabeledText(text);
  } else {
    throw new Error("الصيغة غير مدعومة؛ استخدم TXT أو XLSX أو DOCX");
  }

  if (records.length > 500)
    throw new Error("الحد الأقصى للاستيراد هو 500 سؤال في المرة الواحدة");
  return records.map(buildQuestion);
}

module.exports = { parseQuestionFile, parseLabeledText, parseTableRows };
