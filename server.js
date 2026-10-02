// سيرفر المسابقة - بدون أي مكتبات خارجية. شغّله بـ: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const PORT=process.env.PORT||3000,D=path.join(__dirname,'data'),P=path.join(__dirname,'public');
const QF=path.join(D,'questions.json'),GF=path.join(D,'game.json');
fs.mkdirSync(D,{recursive:true});
const rd=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}};
const wr=(f,o)=>{fs.writeFileSync(f+'.tmp',JSON.stringify(o,null,2));fs.renameSync(f+'.tmp',f)};
if(!fs.existsSync(QF))wr(QF,rd(path.join(__dirname,'seed.json'),[]));
let game=rd(GF,{cs:[],cur:{id:null,q:0,o:0,a:0,buz:null,res:null},f:'الكل',used:[],v:0});
const clients=new Set();
const send=(r,ev,d)=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`);
const push=(ev,d)=>clients.forEach(r=>send(r,ev,d));
const body=req=>new Promise(ok=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{ok(JSON.parse(b))}catch{ok(null)}})});
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const json=(res,o,c=200)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
http.createServer(async(req,res)=>{
 const u=req.url.split('?')[0];
 if(u==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
  clients.add(res);send(res,'q',rd(QF,[]));send(res,'game',game);req.on('close',()=>clients.delete(res));return}
 if(u==='/api/game'&&req.method==='POST'){const b=await body(req);if(!b)return json(res,{error:1},400);game=b;wr(GF,game);push('game',game);return json(res,{ok:1})}
 if(u==='/api/questions'&&req.method==='POST'){const b=await body(req);if(!b||!b.x||!b.t)return json(res,{error:'بيانات ناقصة'},400);
  const l=rd(QF,[]);if(!b.id)b.id='q'+Date.now();const i=l.findIndex(q=>q.id===b.id);i<0?l.push(b):l[i]=b;wr(QF,l);push('q',l);return json(res,{ok:1,id:b.id})}
 if(u.startsWith('/api/questions/')&&req.method==='DELETE'){const id=decodeURIComponent(u.split('/').pop());const l=rd(QF,[]).filter(q=>q.id!==id);wr(QF,l);push('q',l);return json(res,{ok:1})}
 if(u==='/api/reload'){push('q',rd(QF,[]));return json(res,{ok:1})}
 let f=u==='/tablet'?'tablet.html':u==='/screen'?'screen.html':u==='/'?'index.html':u.slice(1);
 f=path.join(P,path.normalize(f));
 if(!f.startsWith(P)||!fs.existsSync(f)){res.writeHead(404);return res.end('404')}
 res.writeHead(200,{'Content-Type':(T[path.extname(f)]||'text/plain')+'; charset=utf-8'});fs.createReadStream(f).pipe(res);
}).listen(PORT,'0.0.0.0',()=>{
 console.log('\n✅ السيرفر شغال\n');
 for(const a of Object.values(os.networkInterfaces()).flat())if(a.family==='IPv4'&&!a.internal)
  console.log(`  التابلت: http://${a.address}:${PORT}/tablet\n  الشاشة : http://${a.address}:${PORT}/screen\n`);
 console.log(`  على نفس الجهاز: http://localhost:${PORT}\n`)});
