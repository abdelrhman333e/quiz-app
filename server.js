// سيرفر المسابقة v2 — حسابات + قاعدة بيانات Postgres (Supabase)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

// ---------- الإعدادات ----------
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATABASE_URL = process.env.DATABASE_URL;
const SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash("sha256")
    .update(DATABASE_URL || "dev")
    .digest("hex");

const db = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  ssl:
    DATABASE_URL && !/localhost|127\.0\.0\.1/.test(DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined,
});
const query = (sql, params) => db.query(sql, params).then((r) => r.rows);

const SEED = JSON.parse(
  fs.readFileSync(path.join(__dirname, "seed.json"), "utf8"),
);

const NEWGAME = () => ({
  cs: [],
  cur: { id: null, q: 0, o: 0, a: 0, p: 0, buz: null, res: null },
  f: "الكل",
  used: [],
  v: 0,
});

async function init() {
  await query(`CREATE TABLE IF NOT EXISTS users(
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pass TEXT NOT NULL,
    room TEXT UNIQUE NOT NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS questions(
    n SERIAL,
    user_id INT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY(user_id, id))`);
  await query(`CREATE TABLE IF NOT EXISTS games(
    user_id INT PRIMARY KEY,
    data JSONB NOT NULL)`);
}

// ---------- الأمان ----------
const safeEqual = (a, b) => {
  a = Buffer.from(a);
  b = Buffer.from(b);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const hash = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");

const checkPassword = (pw, stored) =>
  safeEqual(hash(pw, stored.split(":")[0]), stored);

const sign = (s) =>
  crypto.createHmac("sha256", SECRET).update(s).digest("base64url");

const makeToken = (id) => {
  const body = id + "." + (Date.now() + 30 * 864e5);
  return body + "." + sign(body);
};

const verifyToken = (t) => {
  const p = (t || "").split(".");
  if (p.length !== 3) return null;
  if (!safeEqual(sign(p[0] + "." + p[1]), p[2])) return null;
  if (+p[1] < Date.now()) return null;
  return +p[0];
};

const parseCookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim().split("="))
      .filter((a) => a[0]),
  );

const authUid = (req) => verifyToken(parseCookies(req).s);

// تحديد محاولات الدخول الفاشلة (8 محاولات / 10 دقايق)
const fails = new Map();
const isThrottled = (key) => {
  const f = fails.get(key);
  return f && f.n >= 8 && Date.now() - f.t < 6e5;
};
const registerFail = (key) => {
  const f = fails.get(key);
  const n = f && Date.now() - f.t < 6e5 ? f.n : 0;
  fails.set(key, { n: n + 1, t: Date.now() });
};

// ---------- البيانات ----------
const getQuestions = async (uid) =>
  (
    await query("SELECT data FROM questions WHERE user_id=$1 ORDER BY n", [uid])
  ).map((r) => r.data);

const getGame = async (uid) =>
  (await query("SELECT data FROM games WHERE user_id=$1", [uid]))[0]?.data ||
  NEWGAME();

// اللي بيوصل للشاشة العامة (من غير الإجابات إلا لما تتعرض)
function view(game, questions) {
  const cur = game.cur;
  const x = questions.find((a) => a.id === cur.id);
  const shown = !!(x && cur.q);
  const hasOptions = !!x?.o?.length;

  const v = {
    cs: (game.cs || []).map(({ n, s, y, r }) => ({ n, s, y, r })),
    shown,
    buz: cur.buz,
    res: cur.res,
  };

  if (shown) {
    Object.assign(v, {
      t: x.t,
      d: x.d,
      x: x.x,
      o: cur.o && hasOptions ? x.o : null,
      c: cur.a && hasOptions ? x.c : null,
      ans: cur.a ? (hasOptions ? x.o[x.c] : x.a) : null,
      m: cur.p ? x.m || null : null,
    });
  }
  return v;
}

// ---------- البث اللحظي (SSE) ----------
const rooms = new Map();

const send = (res, event, data) =>
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

async function pushAll(uid) {
  const clients = rooms.get(uid);
  if (!clients || !clients.size) return;

  const [questions, game] = await Promise.all([
    getQuestions(uid),
    getGame(uid),
  ]);

  for (const c of clients) {
    if (c.screen) {
      send(c.res, "view", view(game, questions));
    } else {
      send(c.res, "q", questions);
      send(c.res, "game", game);
    }
  }
}

// إبقاء الاتصال حي
setInterval(
  () => rooms.forEach((set) => set.forEach((c) => c.res.write(": ka\n\n"))),
  25000,
);

// ---------- مساعدات HTTP ----------
const readBody = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (chunk) => {
      b += chunk;
      if (b.length > 2e5) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(b));
      } catch {
        resolve(null);
      }
    });
  });

const json = (res, obj, code = 200, headers = {}) => {
  res.writeHead(code, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(obj));
};

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// تنظيف بيانات السؤال قبل الحفظ
function cleanQuestion(b) {
  const options = Array.isArray(b.o)
    ? b.o
        .map((s) => str(s, 200))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  // رابط الصوت: يوتيوب أو سبوتيفاي فقط
  const link = str(b.m, 300);
  const linkOk =
    /^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be|open\.spotify\.com)\//.test(
      link,
    )
      ? link
      : "";

  const x = {
    id: str(b.id, 40) || "q" + Date.now(),
    t: str(b.t, 40),
    d: b.d === "h" ? "h" : "e",
    x: str(b.x, 500),
    o: options,
    c: options.length ? Math.min(3, Math.max(0, +b.c || 0)) : -1,
    a: str(b.a, 300),
    m: linkOk,
  };

  const valid =
    x.t && x.x && (options.length === 4 || (!options.length && x.a));
  return valid ? x : null;
}

// ---------- السيرفر ----------
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const pathname = url.pathname;
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
      const secure =
        req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";

      const setCookie = (id) => ({
        "Set-Cookie": `s=${id ? makeToken(id) : ""}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${id ? 2592000 : 0}${secure}`,
      });

      // ----- تسجيل / دخول -----
      if (pathname === "/api/register" || pathname === "/api/login") {
        if (req.method !== "POST") return json(res, { error: "x" }, 405);

        const b = await readBody(req);
        const name = str(b?.u, 20).toLowerCase();
        const pw = typeof b?.p === "string" ? b.p : "";
        const key = ip + name;

        if (isThrottled(key)) {
          return json(res, { error: "محاولات كتير، استنى شوية" }, 429);
        }

        if (pathname === "/api/register") {
          if (!/^[\w\u0600-\u06FF.-]{3,20}$/.test(name)) {
            return json(
              res,
              { error: "الاسم 3-20 حرف (حروف وأرقام فقط)" },
              400,
            );
          }
          if (pw.length < 6) {
            return json(res, { error: "كلمة السر 6 أحرف على الأقل" }, 400);
          }
          const exists = await query("SELECT 1 FROM users WHERE username=$1", [
            name,
          ]);
          if (exists.length) {
            return json(res, { error: "الاسم مستخدم، اختار غيره" }, 409);
          }

          const room = crypto.randomBytes(4).toString("hex");
          const id = (
            await query(
              "INSERT INTO users(username,pass,room) VALUES($1,$2,$3) RETURNING id",
              [name, hash(pw), room],
            )
          )[0].id;

          for (const s of SEED) {
            await query(
              "INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)",
              [id, s.id, JSON.stringify(s)],
            );
          }
          return json(res, { ok: 1 }, 200, setCookie(id));
        }

        // دخول
        const user = (
          await query("SELECT id,pass FROM users WHERE username=$1", [name])
        )[0];
        if (!user || !checkPassword(pw, user.pass)) {
          registerFail(key);
          return json(res, { error: "الاسم أو كلمة السر غلط" }, 401);
        }
        return json(res, { ok: 1 }, 200, setCookie(user.id));
      }

      // ----- خروج -----
      if (pathname === "/api/logout") {
        return json(res, { ok: 1 }, 200, setCookie(0));
      }

      // ----- البث اللحظي -----
      if (pathname === "/events") {
        const room = url.searchParams.get("room");
        let uid;
        let screen = false;

        if (room) {
          const r = await query("SELECT id FROM users WHERE room=$1", [
            room.slice(0, 20),
          ]);
          if (!r.length) {
            res.writeHead(404);
            return res.end();
          }
          uid = r[0].id;
          screen = true;
        } else {
          uid = authUid(req);
          if (!uid) {
            res.writeHead(401);
            return res.end();
          }
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        const client = { res, screen };
        if (!rooms.has(uid)) rooms.set(uid, new Set());
        rooms.get(uid).add(client);
        req.on("close", () => rooms.get(uid)?.delete(client));

        const [questions, game] = await Promise.all([
          getQuestions(uid),
          getGame(uid),
        ]);
        if (screen) {
          send(res, "view", view(game, questions));
        } else {
          send(res, "q", questions);
          send(res, "game", game);
        }
        return;
      }

      // ----- باقي الـ API (محتاج تسجيل دخول) -----
      if (pathname.startsWith("/api/")) {
        const uid = authUid(req);
        if (!uid) return json(res, { error: "سجّل دخول أولًا" }, 401);

        if (pathname === "/api/me") {
          const r = (
            await query("SELECT username,room FROM users WHERE id=$1", [uid])
          )[0];
          return r
            ? json(res, { u: r.username, room: r.room })
            : json(res, { error: "x" }, 401);
        }

        if (pathname === "/api/ping") {
          await query("SELECT 1");
          return json(res, { ok: 1 });
        }

        if (pathname === "/api/game" && req.method === "POST") {
          const b = await readBody(req);
          if (!b || !Array.isArray(b.cs) || !b.cur) {
            return json(res, { error: "بيانات غير صالحة" }, 400);
          }
          await query(
            `INSERT INTO games(user_id,data) VALUES($1,$2)
             ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data`,
            [uid, JSON.stringify(b)],
          );
          pushAll(uid);
          return json(res, { ok: 1 });
        }

        if (pathname === "/api/questions" && req.method === "POST") {
          const x = cleanQuestion((await readBody(req)) || {});
          if (!x) return json(res, { error: "بيانات السؤال ناقصة" }, 400);

          const updated = await query(
            "UPDATE questions SET data=$3 WHERE user_id=$1 AND id=$2 RETURNING id",
            [uid, x.id, JSON.stringify(x)],
          );
          if (!updated.length) {
            await query(
              "INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)",
              [uid, x.id, JSON.stringify(x)],
            );
          }
          pushAll(uid);
          return json(res, { ok: 1, id: x.id });
        }

        if (
          pathname.startsWith("/api/questions/") &&
          req.method === "DELETE"
        ) {
          const id = decodeURIComponent(pathname.split("/").pop());
          await query("DELETE FROM questions WHERE user_id=$1 AND id=$2", [
            uid,
            id,
          ]);
          pushAll(uid);
          return json(res, { ok: 1 });
        }

        return json(res, { error: "x" }, 404);
      }

      // ----- الملفات الثابتة -----
      let file;
      if (pathname === "/tablet") file = "tablet.html";
      else if (pathname.startsWith("/screen")) file = "screen.html";
      else if (pathname === "/") file = "index.html";
      else file = pathname.slice(1);

      file = path.join(PUBLIC_DIR, path.normalize(file));
      if (
        !file.startsWith(PUBLIC_DIR) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      ) {
        res.writeHead(404);
        return res.end("404");
      }

      res.writeHead(200, {
        "Content-Type":
          (MIME[path.extname(file)] || "text/plain") + "; charset=utf-8",
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) json(res, { error: "خطأ في السيرفر" }, 500);
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