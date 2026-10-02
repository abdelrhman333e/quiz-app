const LB=['أ','ب','ج','د'],PT={e:1,h:2};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let Qs=[],G=null;
const cq=()=>Qs.find(x=>x.id===G?.cur.id);
async function api(p,m='GET',b){const r=await fetch(p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'خطأ');return j}
function connect(cb){const es=new EventSource('/events');
 es.addEventListener('q',e=>{Qs=JSON.parse(e.data);cb()});es.addEventListener('game',e=>{G=JSON.parse(e.data);cb()})}
function board(){
 return [...G.cs].sort((a,b)=>b.s-a.s).map((c,k)=>`<div class="pl"><span class="rk">${k+1}</span><span class="nm">${esc(c.n)}</span>
 <span>${'<i class="cd" style="background:#facc15"></i>'.repeat(c.y)}${'<i class="cd" style="background:#ef4444"></i>'.repeat(c.r)}</span><span class="sc">${c.s}</span></div>`).join('')||'<small>—</small>'}
