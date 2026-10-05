const ExcelJS = require("exceljs");
const { Document, Packer, Paragraph } = require("docx");

const columns = [
  "التصنيف",
  "السؤال",
  "الصعوبة",
  "الاختيار أ",
  "الاختيار ب",
  "الاختيار ج",
  "الاختيار د",
  "الإجابة",
];

async function exportQuestionFile(questions, format) {
  const normalQuestions = questions.filter(
      (question) => (question.kind || "normal") === "normal",
    ),
    records = normalQuestions.map((question) => [
      question.t,
      question.x,
      question.d === "h" ? "صعب" : "سهل",
      ...(question.o?.length === 4 ? question.o : ["", "", "", ""]),
      question.o?.length === 4
        ? ["أ", "ب", "ج", "د"][question.c]
        : question.a,
    ]);
  if (!records.length)
    throw new Error(
      "لا توجد أسئلة عادية للتصدير بهذه الصيغة. استخدم JSON لتصدير جميع أنواع الأسئلة والصوت.",
    );

  if (format === "txt") {
    const label = (value) => String(value ?? "").replace(/\r?\n/g, " ");
    return {
      data: Buffer.from(
        records
          .map((record) =>
            columns
              .map((column, index) => `${column}: ${label(record[index])}`)
              .join("\n"),
          )
          .join("\n\n"),
        "utf8",
      ),
      contentType: "text/plain; charset=utf-8",
      filename: "quiz-questions.txt",
    };
  }

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("الأسئلة");
    sheet.addRow(columns);
    records.forEach((record) => sheet.addRow(record));
    sheet.views = [{ rightToLeft: true }];
    sheet.getRow(1).font = { bold: true };
    return {
      data: Buffer.from(await workbook.xlsx.writeBuffer()),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: "quiz-questions.xlsx",
    };
  }

  if (format === "docx") {
    const paragraphs = [];
    records.forEach((record, index) => {
      record.forEach((value, column) => {
        paragraphs.push(
          new Paragraph({
            text: `${columns[column]}: ${String(value ?? "")}`,
            bidirectional: true,
          }),
        );
      });
      if (index < records.length - 1)
        paragraphs.push(new Paragraph({ text: "" }));
    });
    return {
      data: await Packer.toBuffer(
        new Document({
          sections: [{ properties: {}, children: paragraphs }],
        }),
      ),
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "quiz-questions.docx",
    };
  }
  throw new Error("صيغة التصدير غير مدعومة");
}

module.exports = { exportQuestionFile };
