const LB = ['أ', 'ب', 'ج', 'د'],
  PT = { e: 1, h: 2 };

const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));

let Qs = [], G = null;
const cq = () => Qs.find(x => x.id === G?.cur.id);

async function api(p, m = 'GET', b) {
  const r = await fetch(p, {
    method: m,
    headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'خطأ');
  return j;
}

function connect(cb) {
  const es = new EventSource('/events');
  es.addEventListener('q', e => {
    Qs = JSON.parse(e.data);
    cb();
  });
  es.addEventListener('game', e => {
    G = JSON.parse(e.data);
    cb();
  });
}

function board(cs = G.cs) {
  return [...cs]
    .sort((a, b) => b.s - a.s)
    .map((c, k) => `<div class="pl"><span class="rk">${k + 1}</span><span class="nm">${esc(c.n)}</span>
 <span>${'<i class="cd" style="background:#facc15"></i>'.repeat(c.y)}${'<i class="cd" style="background:#ef4444"></i>'.repeat(c.r)}</span><span class="sc">${c.s}</span></div>`)
    .join('') || '<small>—</small>';
}

let V = null;

function connectView(room, cb) {
  const es = new EventSource('/events?room=' + encodeURIComponent(room));
  es.addEventListener('view', e => {
    V = JSON.parse(e.data);
    cb();
  });
}

// ✚ جديد: تحويل رابط يوتيوب/سبوتيفاي لرابط تضمين (embed)
function embedSrc(u, play) {
  try {
    const x = new URL(u);
    let id;
    if (x.hostname.includes('youtu.be')) id = x.pathname.slice(1);
    else if (x.hostname.includes('youtube.com'))
      id = x.searchParams.get('v') || x.pathname.split('/').pop();
    if (id) {
      const s = parseInt(x.searchParams.get('t') || x.searchParams.get('start') || 0) || 0;
      return `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=${play ? 1 : 0}&start=${s}&playsinline=1`;
    }
    if (x.hostname === 'open.spotify.com')
      return 'https://open.spotify.com/embed' + x.pathname.replace(/^\/intl-[a-z]+/, '');
  } catch {}
  return null;
}