// سيرفر المسابقة v2 — حسابات + قاعدة بيانات Postgres (Supabase)
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const { Pool } = require("pg");
const { parseQuestionFile } = require("./question-import");
const { exportQuestionFile } = require("./question-export");
const PORT = process.env.PORT || 3000,
  P = path.join(__dirname, "public"),
  DBU = process.env.DATABASE_URL;
const SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update(DBU || "dev")
    .digest("hex");
const db = new Pool({
  connectionString: DBU,
  max: 5,
  ssl:
    DBU && !/localhost|127\.0\.0\.1/.test(DBU)
      ? { rejectUnauthorized: false }
      : undefined,
});
const q = (s, p) => db.query(s, p).then((r) => r.rows);
const SEED = JSON.parse(
  fs.readFileSync(path.join(__dirname, "seed.json"), "utf8"),
);
const NEWGAME = () => ({
  cs: [],
  cur: { id: null, q: 0, o: 0, a: 0, buz: null, res: null },
  f: "الكل",
  used: [],
  v: 0,
});
async function init() {
  await q(
    `CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,pass TEXT NOT NULL,room TEXT UNIQUE NOT NULL)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS questions(n SERIAL,user_id INT NOT NULL,id TEXT NOT NULL,data JSONB NOT NULL,PRIMARY KEY(user_id,id))`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS games(user_id INT PRIMARY KEY,data JSONB NOT NULL)`,
  );
  await q(
    `CREATE TABLE IF NOT EXISTS audio_assets(id UUID PRIMARY KEY,user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,content_type TEXT NOT NULL,data BYTEA NOT NULL)`,
  );
}
// ---- أمان
const eq = (a, b) => {
  a = Buffer.from(a);
  b = Buffer.from(b);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const hash = (p, s = crypto.randomBytes(16).toString("hex")) =>
  s + ":" + crypto.scryptSync(p, s, 32).toString("hex");
const check = (p, h) => eq(hash(p, h.split(":")[0]), h);
const sign = (s) =>
  crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const token = (id) => {
  const b = id + "." + (Date.now() + 30 * 864e5);
  return b + "." + sign(b);
};
const verify = (t) => {
  const p = (t || "").split(".");
  if (
    p.length !== 3 ||
    !eq(sign(p[0] + "." + p[1]), p[2]) ||
    +p[1] < Date.now()
  )
    return null;
  return +p[0];
};
const cookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim().split("="))
      .filter((a) => a[0]),
  );
const authUid = (req) => verify(cookies(req).s);
const fails = new Map();
const throttled = (k) => {
  const f = fails.get(k);
  return f && f.n >= 8 && Date.now() - f.t < 6e5;
};
const fail = (k) => {
  const f = fails.get(k);
  fails.set(k, {
    n: (f && Date.now() - f.t < 6e5 ? f.n : 0) + 1,
    t: Date.now(),
  });
};
// ---- بيانات
const getQs = async (u) =>
  (await q("SELECT data FROM questions WHERE user_id=$1 ORDER BY n", [u])).map(
    (r) => r.data,
  );
const getGame = async (u) =>
  (await q("SELECT data FROM games WHERE user_id=$1", [u]))[0]?.data ||
  NEWGAME();
function view(g, qs) {
  const c = g.cur,
    x = qs.find((a) => a.id === c.id),
    sh = !!(x && c.q),
    top = x?.kind === "top5" || x?.kind === "top10",
    reverse = x?.kind === "reverse",
    visual = x?.kind === "visual";
  const v = {
    cs: (g.cs || []).map(({ n, s, y, r, correct, wrong }) => ({
      n,
      s,
      y,
      r,
      correct: Number.isSafeInteger(correct) ? Math.max(0, correct) : 0,
      wrong: Number.isSafeInteger(wrong) ? Math.max(0, wrong) : 0,
    })),
    stats: {
      correct: Number.isSafeInteger(g.stats?.correct)
        ? Math.max(0, g.stats.correct)
        : 0,
      wrong: Number.isSafeInteger(g.stats?.wrong)
        ? Math.max(0, g.stats.wrong)
        : 0,
    },
    showStats: !!g.showStats,
    shown: sh,
    displayId: c.displayId || null,
    roulette: sh ? c.roulette || null : null,
    timer: sh ? c.timer || null : null,
    buz: c.buz,
    res: c.res,
    mode: reverse ? "reverse" : visual ? "visual" : x?.kind === "audio" ? "audio" : "quiz",
    tutorialPlaying: !!g.tutorialPlaying,
    tutorialStarted: g.tutorialStarted || 0,
    tutorialVideoPlaying: !!g.tutorialVideoPlaying,
    tutorialVideo: g.tutorialVideo || { playing: false, currentTime: 0 },
    tutorialAudio: g.tutorialAudio || {
      playing: false,
      muted: false,
      volume: 1,
      currentTime: 0,
    },
  };
  if (reverse)
    return {
      ...v,
      reverse: { letter: c.rev?.letter || "", started: c.rev?.started || 0 },
    };
  if (visual)
    return sh
      ? { ...v, t: x.t, image: x.image, emoji: x.emoji, ans: c.a ? x.a : null }
      : v;
  if (sh) {
    Object.assign(v, {
      t: x.t,
      d: x.d,
      x: x.x,
      kind: top ? x.kind : "normal",
      audioUrl: x.kind === "audio" ? x.audioUrl : "",
      audioControl: x.kind === "audio" ? c.audioControl || null : null,
    });
    if (top)
      v.revealed = (c.revealed || [])
        .filter(
          (i) =>
            Number.isInteger(i) &&
            i >= 0 &&
            i < (x.kind === "top10" ? 10 : 5),
        )
        .map((i) => ({ rank: i + 1, a: x.r?.[i] }))
        .filter((a) => a.a);
    else
      Object.assign(v, {
        o: c.o && x.o?.length ? x.o : null,
        c: c.a && x.o?.length ? x.c : null,
        ans: c.a ? (x.o?.length ? x.o[x.c] : x.a) : null,
      });
  }
  return v;
}
// ---- بث لحظي
const rooms = new Map();
const send = (r, ev, d) =>
  r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`);
async function pushAll(u) {
  const set = rooms.get(u);
  if (!set || !set.size) return;
  const [qs, g] = await Promise.all([getQs(u), getGame(u)]);
  for (const c of set) {
    if (c.screen) send(c.res, "view", view(g, qs));
    else {
      send(c.res, "q", qs);
      send(c.res, "game", g);
    }
  }
}
setInterval(
  () => rooms.forEach((s) => s.forEach((c) => c.res.write(": ka\n\n"))),
  25000,
);
// ---- مساعدات HTTP
const body = (req) =>
  new Promise((ok) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 2e5) req.destroy();
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(b));
      } catch {
        ok(null);
      }
    });
  });
const readJsonBody = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0,
      oversized = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) chunks.push(chunk);
    });
    req.on("end", () => {
      if (oversized)
        return reject(
          Object.assign(new Error("حجم ملف النسخة الاحتياطية أكبر من المسموح"), {
            status: 413,
          }),
        );
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(
          Object.assign(new Error("ملف النسخة الاحتياطية ليس JSON صالحًا"), {
            status: 400,
          }),
        );
      }
    });
    req.on("error", reject);
  });
const json = (res, o, c = 200, h = {}) => {
  res.writeHead(c, { "Content-Type": "application/json", ...h });
  res.end(JSON.stringify(o));
};
const T = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
};
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
function cleanImage(v) {
  const image = str(v, 1000);
  if (image.startsWith("/") && !image.startsWith("//")) return image;
  try {
    return ["http:", "https:"].includes(new URL(image).protocol) ? image : "";
  } catch {
    return "";
  }
}
function cleanAudio(v) {
  const audio = str(v, 1000);
  try {
    const url = new URL(audio),
      host = url.hostname.toLowerCase();
    if (
      !["http:", "https:"].includes(url.protocol) ||
      /(^|\.)((youtube\.com)|(youtube-nocookie\.com)|(youtu\.be)|(spotify\.com)|(spotify\.link))$/.test(
        host,
      )
    )
      return "";
    return audio;
  } catch {
    return /^\/audio\/[0-9a-f-]{36}$/i.test(audio) ? audio : "";
  }
}
const audioTypes = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
};
function readAudio(
  req,
  limit,
  tooLargeMessage = "حجم الملف أكبر من 20 ميجابايت",
) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0,
      oversized = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) chunks.push(chunk);
    });
    req.on("end", () => {
      if (oversized)
        reject(
          Object.assign(new Error(tooLargeMessage), {
            status: 413,
          }),
        );
      else resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}
function validAudio(data, extension) {
  switch (extension) {
    case "mp3":
      return (
        data.subarray(0, 3).toString("ascii") === "ID3" ||
        (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)
      );
    case "wav":
      return (
        data.subarray(0, 4).toString("ascii") === "RIFF" &&
        data.subarray(8, 12).toString("ascii") === "WAVE"
      );
    case "ogg":
    case "oga":
    case "opus":
      return data.subarray(0, 4).toString("ascii") === "OggS";
    case "m4a":
      return data.subarray(4, 8).toString("ascii") === "ftyp";
    case "aac":
      return data[0] === 0xff && (data[1] & 0xf6) === 0xf0;
    default:
      return false;
  }
}
function cleanQ(b) {
  const kind = ["top5", "top10", "reverse", "visual", "audio"].includes(b.kind)
      ? b.kind
      : "normal",
    r =
      (kind === "top5" || kind === "top10") && Array.isArray(b.r)
        ? b.r.map((s) => str(s, 200)).slice(0, kind === "top10" ? 10 : 5)
        : [],
    o =
      (kind === "normal" || kind === "audio") && Array.isArray(b.o)
        ? b.o
            .map((s) => str(s, 200))
            .filter(Boolean)
            .slice(0, 4)
        : [];
  const a = str(b.a, 300),
    x = {
      id: str(b.id, 40) || "q" + Date.now(),
      t: str(b.t, 40),
      d: b.d === "h" ? "h" : "e",
      x: kind === "reverse" ? a : str(b.x, 500),
      kind,
      r,
      o,
      c: o.length ? Math.min(3, Math.max(0, +b.c || 0)) : -1,
      a,
      image: kind === "visual" ? cleanImage(b.image) : "",
      emoji: kind === "visual" ? str(b.emoji, 20) : "",
      audioUrl: kind === "audio" ? cleanAudio(b.audioUrl) : "",
    };
  return x.t &&
    x.x &&
    (kind === "reverse"
      ? !!a
      : kind === "visual"
        ? !!a && !!(x.image || x.emoji)
        : kind === "top5" || kind === "top10"
          ? r.length === (kind === "top10" ? 10 : 5) && r.every(Boolean)
          : kind === "audio"
            ? !!x.audioUrl && (o.length === 4 || (!o.length && x.a))
            : o.length === 4 || (!o.length && x.a))
    ? x
    : null;
}
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x"),
        u = url.pathname,
        ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
      const secure =
        req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      const audioMatch = /^\/audio\/([0-9a-f-]{36})$/i.exec(u);
      if (audioMatch && ["GET", "HEAD"].includes(req.method)) {
        const asset = (
          await q("SELECT content_type,data FROM audio_assets WHERE id=$1", [
            audioMatch[1],
          ])
        )[0];
        if (!asset) {
          res.writeHead(404);
          return res.end("404");
        }
        const data = asset.data,
          headers = {
            "Content-Type": asset.content_type,
            "Content-Length": data.length,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Accept-Ranges": "bytes",
          },
          range = req.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          let start, end;
          if (match && match[1] === "") {
            const suffix = Number(match[2]);
            if (Number.isSafeInteger(suffix) && suffix > 0) {
              start = Math.max(data.length - suffix, 0);
              end = data.length - 1;
            }
          } else if (match) {
            start = Number(match[1]);
            end = match[2] ? Number(match[2]) : data.length - 1;
          }
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            start >= data.length ||
            end < start
          ) {
            res.writeHead(416, {
              ...headers,
              "Content-Range": `bytes */${data.length}`,
            });
            return res.end();
          }
          end = Math.min(end, data.length - 1);
          res.writeHead(206, {
            ...headers,
            "Content-Length": end - start + 1,
            "Content-Range": `bytes ${start}-${end}/${data.length}`,
          });
          return req.method === "HEAD"
            ? res.end()
            : res.end(data.subarray(start, end + 1));
        }
        res.writeHead(200, headers);
        return req.method === "HEAD" ? res.end() : res.end(data);
      }
      const setC = (id) => ({
        "Set-Cookie": `s=${id ? token(id) : ""}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${id ? 2592000 : 0}${secure}`,
      });
      if (u === "/api/register" || u === "/api/login") {
        if (req.method !== "POST") return json(res, { error: "x" }, 405);
        const b = await body(req),
          name = str(b?.u, 20).toLowerCase(),
          pw = typeof b?.p === "string" ? b.p : "",
          k = ip + name;
        if (throttled(k))
          return json(res, { error: "محاولات كتير، استنى شوية" }, 429);
        if (u === "/api/register") {
          if (!/^[\w\u0600-\u06FF.-]{3,20}$/.test(name))
            return json(
              res,
              { error: "الاسم 3-20 حرف (حروف وأرقام فقط)" },
              400,
            );
          if (pw.length < 6)
            return json(res, { error: "كلمة السر 6 أحرف على الأقل" }, 400);
          if ((await q("SELECT 1 FROM users WHERE username=$1", [name])).length)
            return json(res, { error: "الاسم مستخدم، اختار غيره" }, 409);
          const room = crypto.randomBytes(4).toString("hex"),
            id = (
              await q(
                "INSERT INTO users(username,pass,room) VALUES($1,$2,$3) RETURNING id",
                [name, hash(pw), room],
              )
            )[0].id;
          for (const s of SEED)
            await q("INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)", [
              id,
              s.id,
              JSON.stringify(s),
            ]);
          return json(res, { ok: 1 }, 200, setC(id));
        }
        const r = (
          await q("SELECT id,pass FROM users WHERE username=$1", [name])
        )[0];
        if (!r || !check(pw, r.pass)) {
          fail(k);
          return json(res, { error: "الاسم أو كلمة السر غلط" }, 401);
        }
        return json(res, { ok: 1 }, 200, setC(r.id));
      }
      if (u === "/api/logout") return json(res, { ok: 1 }, 200, setC(0));
      if (u === "/events") {
        const room = url.searchParams.get("room");
        let uid,
          screen = false;
        if (room) {
          const r = await q("SELECT id FROM users WHERE room=$1", [
            room.slice(0, 20),
          ]);
          if (!r.length) {
            res.writeHead(404);
            return res.end();
          }
          uid = r[0].id;
          screen = true;
        } else if (!(uid = authUid(req))) {
          res.writeHead(401);
          return res.end();
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const c = { res, screen };
        if (!rooms.has(uid)) rooms.set(uid, new Set());
        rooms.get(uid).add(c);
        req.on("close", () => rooms.get(uid)?.delete(c));
        const [qs, g] = await Promise.all([getQs(uid), getGame(uid)]);
        if (screen) send(res, "view", view(g, qs));
        else {
          send(res, "q", qs);
          send(res, "game", g);
        }
        return;
      }
      if (u.startsWith("/api/")) {
        const uid = authUid(req);
        if (!uid) return json(res, { error: "سجّل دخول أولًا" }, 401);
        if (u === "/api/me") {
          const r = (
            await q("SELECT username,room FROM users WHERE id=$1", [uid])
          )[0];
          return r
            ? json(res, { u: r.username, room: r.room })
            : json(res, { error: "x" }, 401);
        }
        if (u === "/api/ping") {
          await q("SELECT 1");
          return json(res, { ok: 1 });
        }
        if (u === "/api/questions/export" && req.method === "GET") {
          const format = url.searchParams.get("format") || "json",
            questions = await getQs(uid);
          if (!["json", "txt", "xlsx", "docx"].includes(format))
            return json(res, { error: "صيغة التصدير غير مدعومة" }, 400);
          if (format !== "json") {
            let file;
            try {
              file = await exportQuestionFile(questions, format);
            } catch (error) {
              return json(res, { error: error.message }, 400);
            }
            res.writeHead(200, {
              "Content-Type": file.contentType,
              "Content-Disposition": `attachment; filename="${file.filename}"`,
              "Cache-Control": "no-store",
            });
            return res.end(file.data);
          }
          const assets = {},
            ids = [
              ...new Set(
                questions
                  .map((question) =>
                    /^\/audio\/([0-9a-f-]{36})$/i.exec(question.audioUrl || "")?.[1],
                  )
                  .filter(Boolean),
              ),
            ];
          if (ids.length) {
            const stored = await q(
              "SELECT id,content_type,data FROM audio_assets WHERE user_id=$1 AND id=ANY($2::uuid[])",
              [uid, ids],
            );
            if (stored.length !== ids.length)
              return json(
                res,
                { error: "تعذر تصدير بعض الملفات الصوتية المرتبطة بالأسئلة" },
                500,
              );
            let totalAudioBytes = 0;
            const extensions = {
              "audio/mpeg": "mp3",
              "audio/wav": "wav",
              "audio/ogg": "ogg",
              "audio/mp4": "m4a",
              "audio/aac": "aac",
            };
            for (const asset of stored) {
              totalAudioBytes += asset.data.length;
              if (totalAudioBytes > 50 * 1024 * 1024)
                return json(
                  res,
                  { error: "إجمالي ملفات الصوت يتجاوز 50 ميجابايت؛ قلّلها ثم أعد التصدير" },
                  413,
                );
              const extension = extensions[asset.content_type];
              if (!extension)
                return json(
                  res,
                  { error: "صيغة ملف صوتي مرتبطة بالأسئلة غير مدعومة في النسخة الاحتياطية" },
                  415,
                );
              assets[asset.id] = {
                extension,
                data: asset.data.toString("base64"),
              };
            }
          }
          const backup = {
            format: "quiz-app-questions",
            version: 1,
            exportedAt: new Date().toISOString(),
            questions,
            assets,
          };
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": 'attachment; filename="quiz-questions-backup.json"',
            "Cache-Control": "no-store",
          });
          return res.end(JSON.stringify(backup));
        }
        if (u === "/api/questions/import-file" && req.method === "POST") {
          const extension = str(req.headers["x-import-extension"], 8)
              .replace(/^\./, "")
              .toLowerCase();
          if (!["txt", "xlsx", "docx"].includes(extension)) {
            req.resume();
            return json(res, { error: "استخدم ملف TXT أو XLSX أو DOCX" }, 415);
          }
          const data = await readAudio(
            req,
            10 * 1024 * 1024,
            "حجم ملف الأسئلة يجب ألا يتجاوز 10 ميجابايت",
          );
          let questions;
          try {
            questions = await parseQuestionFile(extension, data);
          } catch (error) {
            return json(
              res,
              { error: error.message || "تعذر قراءة ملف الأسئلة" },
              400,
            );
          }
          const imported = questions.map((question) =>
            cleanQ({ ...question, id: "q" + crypto.randomUUID() }),
          );
          const invalid = imported.findIndex((question) => !question);
          if (invalid >= 0)
            return json(
              res,
              { error: `السؤال رقم ${invalid + 1} غير مكتمل أو غير صالح` },
              400,
            );
          const client = await db.connect();
          try {
            await client.query("BEGIN");
            for (const question of imported)
              await client.query(
                "INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)",
                [uid, question.id, JSON.stringify(question)],
              );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
          pushAll(uid);
          return json(res, { ok: 1, imported: imported.length });
        }
        if (u === "/api/questions/import" && req.method === "POST") {
          const backup = await readJsonBody(req, 75 * 1024 * 1024);
          if (
            !backup ||
            backup.format !== "quiz-app-questions" ||
            backup.version !== 1 ||
            !Array.isArray(backup.questions) ||
            !backup.assets ||
            typeof backup.assets !== "object" ||
            Array.isArray(backup.assets)
          )
            return json(res, { error: "صيغة النسخة الاحتياطية غير مدعومة" }, 400);
          if (backup.questions.length > 500)
            return json(
              res,
              { error: "الحد الأقصى لاستيراد النسخة هو 500 سؤال" },
              400,
            );
          const imported = [],
            assets = new Map(),
            extensions = new Set(Object.keys(audioTypes));
          let totalAudioBytes = 0;
          for (const [id, asset] of Object.entries(backup.assets)) {
            if (
              !/^[0-9a-f-]{36}$/i.test(id) ||
              !asset ||
              typeof asset.data !== "string" ||
              !extensions.has(asset.extension)
            )
              return json(res, { error: "بيانات ملف صوتي في النسخة غير صالحة" }, 400);
            const data = Buffer.from(asset.data, "base64");
            if (
              !data.length ||
              data.length > 20 * 1024 * 1024 ||
              data.toString("base64") !== asset.data ||
              !validAudio(data, asset.extension)
            )
              return json(res, { error: "ملف صوتي في النسخة تالف أو لا يطابق صيغته" }, 400);
            totalAudioBytes += data.length;
            if (totalAudioBytes > 50 * 1024 * 1024)
              return json(res, { error: "إجمالي ملفات الصوت يتجاوز 50 ميجابايت" }, 413);
            assets.set(id, { data, contentType: audioTypes[asset.extension] });
          }
          const sourceIds = new Set();
          for (const source of backup.questions) {
            if (!source || typeof source !== "object" || Array.isArray(source))
              return json(res, { error: "يوجد سؤال غير صالح في النسخة" }, 400);
            const originalId = str(source.id, 40);
            if (!originalId || sourceIds.has(originalId))
              return json(res, { error: "معرّفات الأسئلة في النسخة مفقودة أو مكررة" }, 400);
            sourceIds.add(originalId);
            const audioId =
              source.kind === "audio"
                ? /^\/audio\/([0-9a-f-]{36})$/i.exec(
                    source.audioUrl || "",
                  )?.[1]
                : null;
            let audio = null;
            if (audioId) {
              audio = assets.get(audioId);
              if (!audio)
                return json(
                  res,
                  { error: "ملف صوتي مرتبط بأحد الأسئلة غير موجود في النسخة" },
                  400,
                );
            }
            const question = cleanQ({
              ...source,
              id: "q" + crypto.randomUUID(),
              audioUrl: audioId ? `/audio/${audioId}` : source.audioUrl,
            });
            if (!question)
              return json(
                res,
                { error: `بيانات السؤال «${str(source.x, 80)}» غير مكتملة أو غير صالحة` },
                400,
              );
            imported.push({ question, audio, audioId });
          }
          const client = await db.connect();
          try {
            await client.query("BEGIN");
            const importedAudio = new Map();
            for (const { question, audio, audioId } of imported) {
              if (audio) {
                const id = importedAudio.get(audioId) || crypto.randomUUID();
                if (!importedAudio.has(audioId)) {
                  await client.query(
                    "INSERT INTO audio_assets(id,user_id,content_type,data) VALUES($1,$2,$3,$4)",
                    [id, uid, audio.contentType, audio.data],
                  );
                  importedAudio.set(audioId, id);
                }
                question.audioUrl = `/audio/${id}`;
              }
              await client.query(
                "INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)",
                [uid, question.id, JSON.stringify(question)],
              );
            }
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
          pushAll(uid);
          return json(res, { ok: 1, imported: imported.length });
        }
        if (u === "/api/audio" && req.method === "POST") {
          const extension = str(req.headers["x-audio-extension"], 8)
              .replace(/^\./, "")
              .toLowerCase(),
            contentType = audioTypes[extension];
          if (!contentType) {
            req.resume();
            return json(res, { error: "صيغة الملف الصوتي غير مدعومة" }, 415);
          }
          const data = await readAudio(req, 20 * 1024 * 1024);
          if (!data.length)
            return json(res, { error: "الملف الصوتي فارغ" }, 400);
          if (!validAudio(data, extension))
            return json(res, { error: "محتوى الملف لا يطابق صيغته الصوتية" }, 415);
          const id = crypto.randomUUID();
          await q(
            "INSERT INTO audio_assets(id,user_id,content_type,data) VALUES($1,$2,$3,$4)",
            [id, uid, contentType, data],
          );
          return json(res, { url: `/audio/${id}` });
        }
        if (u.startsWith("/api/audio/") && req.method === "DELETE") {
          const id = u.slice("/api/audio/".length);
          if (!/^[0-9a-f-]{36}$/i.test(id))
            return json(res, { error: "رابط الملف غير صالح" }, 400);
          await q("DELETE FROM audio_assets WHERE id=$1 AND user_id=$2", [
            id,
            uid,
          ]);
          return json(res, { ok: 1 });
        }
        if (u === "/api/game" && req.method === "POST") {
          const b = await body(req);
          if (!b || !Array.isArray(b.cs) || !b.cur)
            return json(res, { error: "بيانات غير صالحة" }, 400);
          await q(
            "INSERT INTO games(user_id,data) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data",
            [uid, JSON.stringify(b)],
          );
          pushAll(uid);
          return json(res, { ok: 1 });
        }
        if (u === "/api/questions" && req.method === "POST") {
          const x = cleanQ((await body(req)) || {});
          if (!x) return json(res, { error: "بيانات السؤال ناقصة" }, 400);
          const assetId = /^\/audio\/([0-9a-f-]{36})$/i.exec(x.audioUrl)?.[1];
          if (
            assetId &&
            !(await q("SELECT 1 FROM audio_assets WHERE id=$1 AND user_id=$2", [
              assetId,
              uid,
            ])).length
          )
            return json(res, { error: "ملف الصوت غير موجود أو لا تملكه" }, 400);
          const previous = (
            await q("SELECT data FROM questions WHERE user_id=$1 AND id=$2", [
              uid,
              x.id,
            ])
          )[0]?.data;
          const upd = await q(
            "UPDATE questions SET data=$3 WHERE user_id=$1 AND id=$2 RETURNING id",
            [uid, x.id, JSON.stringify(x)],
          );
          if (!upd.length)
            await q("INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)", [
              uid,
              x.id,
              JSON.stringify(x),
            ]);
          const oldAssetId = /^\/audio\/([0-9a-f-]{36})$/i.exec(
            previous?.audioUrl || "",
          )?.[1];
          if (oldAssetId && previous.audioUrl !== x.audioUrl)
            await q(
              "DELETE FROM audio_assets a WHERE a.id=$1 AND a.user_id=$2 AND NOT EXISTS (SELECT 1 FROM questions WHERE user_id=$2 AND data->>'audioUrl'=$3)",
              [oldAssetId, uid, previous.audioUrl],
            );
          pushAll(uid);
          return json(res, { ok: 1, id: x.id });
        }
        if (u.startsWith("/api/questions/") && req.method === "DELETE") {
          const id = decodeURIComponent(u.split("/").pop());
          const previous = (
            await q("SELECT data FROM questions WHERE user_id=$1 AND id=$2", [
              uid,
              id,
            ])
          )[0]?.data;
          await q("DELETE FROM questions WHERE user_id=$1 AND id=$2", [
            uid,
            id,
          ]);
          const assetId = /^\/audio\/([0-9a-f-]{36})$/i.exec(
            previous?.audioUrl || "",
          )?.[1];
          if (assetId)
            await q(
              "DELETE FROM audio_assets a WHERE a.id=$1 AND a.user_id=$2 AND NOT EXISTS (SELECT 1 FROM questions WHERE user_id=$2 AND data->>'audioUrl'=$3)",
              [assetId, uid, previous.audioUrl],
            );
          pushAll(uid);
          return json(res, { ok: 1 });
        }
        return json(res, { error: "x" }, 404);
      }
      let f =
        u === "/tablet"
          ? "tablet.html"
          : u.startsWith("/screen")
            ? "screen.html"
            : u === "/"
              ? "index.html"
              : u.slice(1);
      f = path.join(P, path.normalize(f));
      if (
        !f.startsWith(P) ||
        !fs.existsSync(f) ||
        fs.statSync(f).isDirectory()
      ) {
        res.writeHead(404);
        return res.end("404");
      }
      const ext = path.extname(f);
      if (ext === ".mp4") {
        const size = fs.statSync(f).size,
          headers = {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
          },
          range = req.headers.range;
        if (range) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(range);
          let start, end;
          if (m && m[1] === "") {
            const suffix = Number(m[2]);
            if (Number.isSafeInteger(suffix) && suffix > 0) {
              start = Math.max(size - suffix, 0);
              end = size - 1;
            }
          } else if (m) {
            start = Number(m[1]);
            end = m[2] ? Number(m[2]) : size - 1;
          }
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            start >= size ||
            end < start
          ) {
            res.writeHead(416, {
              ...headers,
              "Content-Range": `bytes */${size}`,
            });
            return res.end();
          }
          end = Math.min(end, size - 1);
          res.writeHead(206, {
            ...headers,
            "Content-Length": end - start + 1,
            "Content-Range": `bytes ${start}-${end}/${size}`,
          });
          if (req.method === "HEAD") return res.end();
          return fs.createReadStream(f, { start, end }).pipe(res);
        }
        res.writeHead(200, { ...headers, "Content-Length": size });
        if (req.method === "HEAD") return res.end();
        return fs.createReadStream(f).pipe(res);
      }
      res.writeHead(200, {
        "Content-Type": (T[ext] || "text/plain") + "; charset=utf-8",
      });
      fs.createReadStream(f).pipe(res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent)
        json(
          res,
          { error: e.status === 413 ? e.message : "خطأ في السيرفر" },
          e.status || 500,
        );
      else res.end();
    }
  })
  .listen(PORT, "0.0.0.0", async () => {
    try {
      await init();
      console.log("✅ شغال على المنفذ", PORT);
    } catch (e) {
      console.error("❌ فشل الاتصال بقاعدة البيانات:", e.message);
    }
  });
