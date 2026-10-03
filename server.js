// سيرفر المسابقة v2 — حسابات + قاعدة بيانات Postgres (Supabase)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Pool}=require('pg');
const PORT=process.env.PORT||3000,P=path.join(__dirname,'public'),DBU=process.env.DATABASE_URL;
const SECRET=process.env.SESSION_SECRET||crypto.createHash('sha256').update(DBU||'dev').digest('hex');
const db=new Pool({connectionString:DBU,max:5,ssl:DBU&&!/localhost|127\.0\.0\.1/.test(DBU)?{rejectUnauthorized:false}:undefined});
const q=(s,p)=>db.query(s,p).then(r=>r.rows);
const SEED=JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json'),'utf8'));
const NEWGAME=()=>({cs:[],cur:{id:null,q:0,o:0,a:0,buz:null,res:null},f:'الكل',used:[],v:0});
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,pass TEXT NOT NULL,room TEXT UNIQUE NOT NULL)`);
 await q(`CREATE TABLE IF NOT EXISTS questions(n SERIAL,user_id INT NOT NULL,id TEXT NOT NULL,data JSONB NOT NULL,PRIMARY KEY(user_id,id))`);
 await q(`CREATE TABLE IF NOT EXISTS games(user_id INT PRIMARY KEY,data JSONB NOT NULL)`);
}
// ---- أمان
const eq=(a,b)=>{a=Buffer.from(a);b=Buffer.from(b);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
const hash=(p,s=crypto.randomBytes(16).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const check=(p,h)=>eq(hash(p,h.split(':')[0]),h);
const sign=s=>crypto.createHmac('sha256',SECRET).update(s).digest('base64url');
const token=id=>{const b=id+'.'+(Date.now()+30*864e5);return b+'.'+sign(b)};
const verify=t=>{const p=(t||'').split('.');if(p.length!==3||!eq(sign(p[0]+'.'+p[1]),p[2])||+p[1]<Date.now())return null;return +p[0]};
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')).filter(a=>a[0]));
const authUid=req=>verify(cookies(req).s);
const fails=new Map();
const throttled=k=>{const f=fails.get(k);return f&&f.n>=8&&Date.now()-f.t<6e5};
const fail=k=>{const f=fails.get(k);fails.set(k,{n:(f&&Date.now()-f.t<6e5?f.n:0)+1,t:Date.now()})};
// ---- بيانات
const getQs=async u=>(await q('SELECT data FROM questions WHERE user_id=$1 ORDER BY n',[u])).map(r=>r.data);
const getGame=async u=>(await q('SELECT data FROM games WHERE user_id=$1',[u]))[0]?.data||NEWGAME();
function view(g,qs){const c=g.cur,x=qs.find(a=>a.id===c.id),sh=!!(x&&c.q),top=x?.kind==='top5',reverse=x?.kind==='reverse';
 const v={cs:(g.cs||[]).map(({n,s,y,r})=>({n,s,y,r})),shown:sh,buz:c.buz,res:c.res,mode:reverse?'reverse':'quiz'};
 if(reverse)return {...v,reverse:{letter:c.rev?.letter||'',started:c.rev?.started||0}};
 if(sh){Object.assign(v,{t:x.t,d:x.d,x:x.x,kind:top?'top5':'normal'});
    if(top)v.revealed=(c.revealed||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<5).map(i=>({rank:i+1,a:x.r?.[i]})).filter(a=>a.a);
    else Object.assign(v,{o:c.o&&x.o?.length?x.o:null,c:c.a&&x.o?.length?x.c:null,ans:c.a?(x.o?.length?x.o[x.c]:x.a):null});}
 return v}
// ---- بث لحظي
const rooms=new Map();
const send=(r,ev,d)=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`);
async function pushAll(u){const set=rooms.get(u);if(!set||!set.size)return;
 const [qs,g]=await Promise.all([getQs(u),getGame(u)]);
 for(const c of set){if(c.screen)send(c.res,'view',view(g,qs));else{send(c.res,'q',qs);send(c.res,'game',g)}}}
setInterval(()=>rooms.forEach(s=>s.forEach(c=>c.res.write(': ka\n\n'))),25000);
// ---- مساعدات HTTP
const body=req=>new Promise(ok=>{let b='';req.on('data',c=>{b+=c;if(b.length>2e5)req.destroy()});req.on('end',()=>{try{ok(JSON.parse(b))}catch{ok(null)}})});
const json=(res,o,c=200,h={})=>{res.writeHead(c,{'Content-Type':'application/json',...h});res.end(JSON.stringify(o))};
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4'};
const str=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
function cleanQ(b){const kind=b.kind==='top5'||b.kind==='reverse'?b.kind:'normal',r=kind==='top5'&&Array.isArray(b.r)?b.r.map(s=>str(s,200)).slice(0,5):[],o=kind==='normal'&&Array.isArray(b.o)?b.o.map(s=>str(s,200)).filter(Boolean).slice(0,4):[];
 const a=str(b.a,300),x={id:str(b.id,40)||'q'+Date.now(),t:str(b.t,40),d:b.d==='h'?'h':'e',x:kind==='reverse'?a:str(b.x,500),kind,r,o,c:o.length?Math.min(3,Math.max(0,+b.c||0)):-1,a};
 return x.t&&x.x&&(kind==='reverse'?!!a:kind==='top5'?r.length===5&&r.every(Boolean):o.length===4||(!o.length&&x.a))?x:null}
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://x'),u=url.pathname,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;
 const secure=req.headers['x-forwarded-proto']==='https'?'; Secure':'';
 const setC=id=>({'Set-Cookie':`s=${id?token(id):''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${id?2592000:0}${secure}`});
 if(u==='/api/register'||u==='/api/login'){
  if(req.method!=='POST')return json(res,{error:'x'},405);
  const b=await body(req),name=str(b?.u,20).toLowerCase(),pw=typeof b?.p==='string'?b.p:'',k=ip+name;
  if(throttled(k))return json(res,{error:'محاولات كتير، استنى شوية'},429);
  if(u==='/api/register'){
   if(!/^[\w\u0600-\u06FF.-]{3,20}$/.test(name))return json(res,{error:'الاسم 3-20 حرف (حروف وأرقام فقط)'},400);
   if(pw.length<6)return json(res,{error:'كلمة السر 6 أحرف على الأقل'},400);
   if((await q('SELECT 1 FROM users WHERE username=$1',[name])).length)return json(res,{error:'الاسم مستخدم، اختار غيره'},409);
   const room=crypto.randomBytes(4).toString('hex'),id=(await q('INSERT INTO users(username,pass,room) VALUES($1,$2,$3) RETURNING id',[name,hash(pw),room]))[0].id;
   for(const s of SEED)await q('INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)',[id,s.id,JSON.stringify(s)]);
   return json(res,{ok:1},200,setC(id))}
  const r=(await q('SELECT id,pass FROM users WHERE username=$1',[name]))[0];
  if(!r||!check(pw,r.pass)){fail(k);return json(res,{error:'الاسم أو كلمة السر غلط'},401)}
  return json(res,{ok:1},200,setC(r.id))}
 if(u==='/api/logout')return json(res,{ok:1},200,setC(0));
 if(u==='/events'){const room=url.searchParams.get('room');let uid,screen=false;
  if(room){const r=await q('SELECT id FROM users WHERE room=$1',[room.slice(0,20)]);if(!r.length){res.writeHead(404);return res.end()}uid=r[0].id;screen=true}
  else if(!(uid=authUid(req))){res.writeHead(401);return res.end()}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive','X-Accel-Buffering':'no'});
  const c={res,screen};if(!rooms.has(uid))rooms.set(uid,new Set());rooms.get(uid).add(c);
  req.on('close',()=>rooms.get(uid)?.delete(c));
  const [qs,g]=await Promise.all([getQs(uid),getGame(uid)]);
  if(screen)send(res,'view',view(g,qs));else{send(res,'q',qs);send(res,'game',g)}return}
 if(u.startsWith('/api/')){
  const uid=authUid(req);if(!uid)return json(res,{error:'سجّل دخول أولًا'},401);
  if(u==='/api/me'){const r=(await q('SELECT username,room FROM users WHERE id=$1',[uid]))[0];return r?json(res,{u:r.username,room:r.room}):json(res,{error:'x'},401)}
  if(u==='/api/ping'){await q('SELECT 1');return json(res,{ok:1})}
  if(u==='/api/game'&&req.method==='POST'){const b=await body(req);if(!b||!Array.isArray(b.cs)||!b.cur)return json(res,{error:'بيانات غير صالحة'},400);
   await q('INSERT INTO games(user_id,data) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data',[uid,JSON.stringify(b)]);pushAll(uid);return json(res,{ok:1})}
  if(u==='/api/questions'&&req.method==='POST'){const x=cleanQ(await body(req)||{});if(!x)return json(res,{error:'بيانات السؤال ناقصة'},400);
   const upd=await q('UPDATE questions SET data=$3 WHERE user_id=$1 AND id=$2 RETURNING id',[uid,x.id,JSON.stringify(x)]);
   if(!upd.length)await q('INSERT INTO questions(user_id,id,data) VALUES($1,$2,$3)',[uid,x.id,JSON.stringify(x)]);
   pushAll(uid);return json(res,{ok:1,id:x.id})}
  if(u.startsWith('/api/questions/')&&req.method==='DELETE'){await q('DELETE FROM questions WHERE user_id=$1 AND id=$2',[uid,decodeURIComponent(u.split('/').pop())]);pushAll(uid);return json(res,{ok:1})}
  return json(res,{error:'x'},404)}
 let f=u==='/tablet'?'tablet.html':u.startsWith('/screen')?'screen.html':u==='/'?'index.html':u.slice(1);
 f=path.join(P,path.normalize(f));
 if(!f.startsWith(P)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('404')}
 const ext=path.extname(f);
 if(ext==='.mp4'){
  const size=fs.statSync(f).size,headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'no-store'},range=req.headers.range;
  if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);let start,end;
   if(m&&m[1]===''){const suffix=Number(m[2]);if(Number.isSafeInteger(suffix)&&suffix>0){start=Math.max(size-suffix,0);end=size-1}}
   else if(m){start=Number(m[1]);end=m[2]?Number(m[2]):size-1}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});return res.end()}
   end=Math.min(end,size-1);res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`});
   if(req.method==='HEAD')return res.end();return fs.createReadStream(f,{start,end}).pipe(res)}
  res.writeHead(200,{...headers,'Content-Length':size});if(req.method==='HEAD')return res.end();return fs.createReadStream(f).pipe(res)
 }
 res.writeHead(200,{'Content-Type':(T[ext]||'text/plain')+'; charset=utf-8'});fs.createReadStream(f).pipe(res);
}catch(e){console.error(e);if(!res.headersSent)json(res,{error:'خطأ في السيرفر'},500);else res.end()}})
.listen(PORT,'0.0.0.0',async()=>{try{await init();console.log('✅ شغال على المنفذ',PORT)}catch(e){console.error('❌ فشل الاتصال بقاعدة البيانات:',e.message)}});
