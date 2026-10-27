const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>(s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),2400)};
const EX=['经查，该院为部分患者开展“各种牙拔除术”，同时收取“各种牙拔除术”和“牙槽骨修整术”两项费用。',
'经查，该院为部分患者开具血清胱抑素（CystatinC）测定，相关患者无糖尿病肾病、高血压肾病等相关诊断及检查指征。'];
const DS='https://api.deepseek.com';
// ---------- 设置 ----------
const DEF={api_key:'',thinking:false,temperature:0.7,use_ai_clean:true,ds_search:false,ds_fetch:false,max_pages:4,model:'deepseek-flash'};
const getS=()=>({...DEF,...JSON.parse(localStorage['ibf.settings']||'{}')});
const setS=o=>localStorage['ibf.settings']=JSON.stringify({...getS(),...o});
const hasKey=()=>!!getS().api_key;
// ---------- DeepSeek ----------
async function dsPost(path,body){const k=getS().api_key;if(!k)throw new Error('未设置 DeepSeek API Key');
  let r;try{r=await fetch(DS+path,{method:'POST',headers:{'Authorization':'Bearer '+k,'Content-Type':'application/json'},body:JSON.stringify(body)})}
  catch(e){throw new Error('无法连接 api.deepseek.com（网络或浏览器跨域限制）')}
  if(!r.ok){const m={401:'Key 无效',402:'余额不足',403:'被安全策略拒绝',404:'无法获取页面内容',429:'超出 QPS 限制'}[r.status]||('HTTP '+r.status);throw new Error(m)}
  return r.json()}
async function chat(messages,json){const s=getS();const body={model:s.model||'deepseek-flash',messages,thinking:{type:s.thinking?'enabled':'disabled'}};
  if(!s.thinking)body.temperature=+s.temperature; if(json&&!s.thinking)body.response_format={type:'json_object'};
  const d=await dsPost('/chat/completions',body);const t=d.choices[0].message.content;
  if(!json)return t;const m=t.match(/\{[\s\S]*\}/);return JSON.parse(m?m[0]:t)}
const dsSearch=async q=>(await dsPost('/v1/tools/search',{query:q.slice(0,128),count:8,need_content:true})).results||[];
const dsFetch=async u=>await dsPost('/v1/tools/fetch',{url:u});
// ---------- 规则识别 ----------
function ruleAnalyze(desc){let items=[];for(const m of desc.matchAll(/[“"「『]([^”"」』]{2,40})[”"」』]/g))if(!items.includes(m[1]))items.push(m[1]);
  if(!items.length)for(const m of desc.matchAll(/(?:开具|开展|实施|进行)([\u4e00-\u9fa5A-Za-z0-9（）()\-]{2,30}?(?:测定|检查|检测|术|治疗|试验))/g))if(!items.includes(m[1]))items.push(m[1]);
  const R=[['重复收费',['重复收费','同时收取','两项费用','分解收费','串换']],['过度检查',['过度检查','检查指征','测定','检测','检查']],['过度诊疗',['过度诊疗','过度治疗','无指征','治疗指征']]];
  let t='其他';for(const[n,k]of R)if(k.some(x=>desc.includes(x))){t=n;break}
  const conds=[...desc.matchAll(/无([\u4e00-\u9fa5、]{2,30}?)等/g)].flatMap(m=>m[1].split('、'));
  return{type:t,items:items.map(n=>({name:n,aliases:[]})),conditions:conds,by:'规则'}}
function variants(name){const base=name.replace(/[（(].*?[)）]/g,'').trim();const v=[...name.matchAll(/[（(]([^)）]+)[)）]/g)].map(m=>m[1]);
  const b2=base.replace(/^(各种|各类|普通|复杂|一般)/,'');v.push(base,b2,b2.replace(/(测定|检测|检查|试验)$/,''));return v.filter(x=>x.length>=2)}
// ---------- 段落定位（非 AI）----------
function splitParas(text){const ps=text.split(/\n+/).map(s=>s.trim()).filter(Boolean),out=[];let buf='';
  for(const p of ps){buf=buf?buf+' '+p:p;if(buf.length>=60){out.push(buf);buf=''}}if(buf)out.push(buf);return out}
function relevantParas(text,kws,maxN=6){const ps=splitParas(text);const sc=[];
  ps.forEach((p,i)=>{let h=0,k=0;kws.forEach(w=>{if(!w)return;const c=p.split(w).length-1;h+=c;if(c)k++});if(h)sc.push([k*10+h,i])});
  sc.sort((a,b)=>b[0]-a[0]);const picked=[...new Set(sc.slice(0,maxN).map(x=>x[1]))].sort((a,b)=>a-b);const R=[];
  for(const i of picked){const a=Math.max(0,i-1),b=Math.min(ps.length,i+2);if(R.length&&a<=R[R.length-1][1])R[R.length-1][1]=Math.max(R[R.length-1][1],b);else R.push([a,b])}
  return R.map(([a,b])=>ps.slice(a,b).join('\n').slice(0,2000))}
async function aiExcerpt(item,qtype,text,url){const focus=qtype==='重复收费'?'项目内涵、除外内容、计价单位、说明':'临床意义、适应证、适用疾病、检查指征、不适用情形';
  const d=await chat([{role:'system',content:`你是严谨的文献摘录员。只能从给定正文中逐字摘录原文句子，不得改写、补充或编造。请摘出与「${item}」的${focus}直接相关的原文段落。若无相关内容输出 {"quotes":[]}。输出 JSON：{"quotes":["原文1","原文2"]}`},{role:'user',content:`来源：${url}\n正文：\n${text.slice(0,12000)}`}],true);
  const n=s=>s.replace(/\s+/g,''),nt=n(text);return(d.quotes||[]).filter(q=>typeof q==='string').map(q=>({text:q,verified:nt.includes(n(q))}))}
// ---------- 知识库（IndexedDB + BM25）----------
let DB;const idb=()=>DB||(DB=new Promise((ok,no)=>{const r=indexedDB.open('ibf-kb',1);r.onupgradeneeded=()=>r.result.createObjectStore('books',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}));
const tx=async(mode,fn)=>{const db=await idb();return new Promise((ok,no)=>{const t=db.transaction('books',mode),st=t.objectStore('books');const r=fn(st);t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>no(t.error)})};
const STOP=new Set('的了和与及或在是为对等'.split(''));
function tok(s){s=s.toLowerCase();const out=[];for(const m of s.matchAll(/[a-z0-9]+|[\u4e00-\u9fff]+/g)){const w=m[0];
  if(/^[a-z0-9]/.test(w)){out.push(w);continue}if(w.length===1){if(!STOP.has(w))out.push(w);continue}for(let i=0;i<w.length-1;i++)out.push(w.slice(i,i+2))}return out}
let KB={chunks:[],df:new Map(),avg:0,books:[]};
async function loadKB(){const books=await tx('readonly',s=>s.getAll());KB={chunks:[],df:new Map(),avg:0,books};
  for(const b of books)for(const c of b.chunks){const t=tok(c.text),tf=new Map();t.forEach(w=>tf.set(w,(tf.get(w)||0)+1));KB.chunks.push({book:b.title,page:c.page,text:c.text,tf,len:t.length});new Set(t).forEach(w=>KB.df.set(w,(KB.df.get(w)||0)+1))}
  KB.avg=KB.chunks.reduce((a,c)=>a+c.len,0)/(KB.chunks.length||1);return books}
function kbSearch(q,kws=[],k=6){const N=KB.chunks.length;if(!N)return[];const qt=[...new Set(tok(q))],k1=1.5,b=.75;
  const res=KB.chunks.map(c=>{let s=0,hit=0;for(const w of qt){const f=c.tf.get(w);if(!f)continue;hit++;const df=KB.df.get(w);const idf=Math.log(1+(N-df+.5)/(df+.5));s+=idf*f*(k1+1)/(f+k1*(1-b+b*c.len/KB.avg))}
    const bonus=kws.filter(w=>w&&c.text.includes(w)).length*3;return{book:c.book,page:c.page,text:c.text,score:+(s+bonus).toFixed(2),hit}}).filter(r=>r.hit>=Math.min(2,qt.length)&&r.score>0);
  return res.sort((a,b)=>b.score-a.score).slice(0,k)}
function chunk(pages,size=500,ov=80){const out=[];for(const[pg,text]of pages){const ps=text.replace(/[ \t\u3000]+/g,' ').split('\n').map(s=>s.trim()).filter(Boolean);let buf='';
  for(const p of ps){if(buf&&buf.length+p.length>size){out.push({page:pg,text:buf});buf=buf.slice(-ov)}buf+=(buf?'\n':'')+p}if(buf.trim())out.push({page:pg,text:buf})}return out}
async function parseFile(f){const ext=f.name.split('.').pop().toLowerCase();let note='';
  if(ext==='pdf'){const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;const pages=[];let empty=0;
    for(let i=1;i<=pdf.numPages;i++){const c=await (await pdf.getPage(i)).getTextContent();let t='',lastY=null;for(const it of c.items){const y=it.transform[5];if(lastY!==null&&Math.abs(y-lastY)>2)t+='\n';t+=it.str;lastY=y}if(t.trim().length<20)empty++;pages.push([i,t])}
    if(empty)note=`${empty} 页未提取到文字（可能为扫描页，单文件版不支持 OCR）`;return{pages,note,n:pdf.numPages}}
  if(ext==='docx'){const r=await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()});return{pages:[[null,r.value]],note}}
  if(['txt','md','markdown'].includes(ext)){const buf=await f.arrayBuffer();let t;try{t=new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch{t=new TextDecoder('gb18030').decode(buf)}return{pages:[[null,t]],note}}
  throw new Error('不支持的文件类型（支持 PDF / DOCX / TXT / MD；.doc 请另存为 .docx）')}
async function addBook(f){const{pages,note,n}=await parseFile(f);const chunks=chunk(pages);if(!chunks.length)throw new Error('未能提取到文字');
  const b={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),title:f.name.replace(/\.[^.]+$/,''),pages:n||null,note,chunks};await tx('readwrite',s=>s.put(b));await loadKB();return b}
// ---------- 界面 ----------
let state={type:'重复收费',items:[]},clips=JSON.parse(localStorage['ibf.clips']||'[]');
$$('nav button').forEach(b=>b.onclick=()=>show(b.dataset.view));
function show(v){$$('nav button').forEach(x=>x.classList.toggle('on',x.dataset.view===v));$$('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));
  if(v==='kb')renderBooks();if(v==='clips')renderClips();if(v==='settings')loadSettings();if(v==='search')keyTip()}
function keyTip(){const s=getS();$('#keyTip').innerHTML=`<svg><use href="#i-alert"/></svg>`+(!s.api_key?'未设置 DeepSeek Key：可用规则识别与本地知识库检索；网页搜索需在「设置」填写 Key 并开启收费的网页搜索。':!s.ds_search?'网页搜索（收费）未开启，当前只检索本地知识库。可在「设置」开启。':`已开启 DeepSeek 网页搜索（收费）${s.ds_fetch?' + 网页抓取（收费）':''}，每次检索会产生按次计费。`)}
$$('[data-ex]').forEach(b=>b.onclick=()=>{$('#desc').value=EX[b.dataset.ex];analyze()});
$$('#qtype button').forEach(b=>b.onclick=()=>setType(b.dataset.t));
function setType(t){state.type=t;$$('#qtype button').forEach(x=>x.classList.toggle('on',x.dataset.t===t))}
function renderChips(){$('#chips').innerHTML=state.items.map((it,i)=>`<span class="chip">${esc(it.name)}<button data-del="${i}" title="移除"><svg><use href="#i-x"/></svg></button></span>`).join('')||'<span class="muted small">尚未添加</span>';
  $$('[data-del]').forEach(b=>b.onclick=()=>{state.items.splice(+b.dataset.del,1);renderChips()})}
function addKw(v){v.split(/[，,、\s]+/).filter(Boolean).forEach(n=>{if(!state.items.some(i=>i.name===n))state.items.push({name:n,aliases:[]})});renderChips()}
$('#kwInput').onkeydown=e=>{if(e.key==='Enter'&&e.target.value.trim()){addKw(e.target.value);e.target.value=''}};
$('#btnAnalyze').onclick=analyze;
async function analyze(){const text=$('#desc').value.trim();if(!text)return toast('请先输入问题描述');const b=$('#btnAnalyze');b.disabled=true;$('#analyzeNote').textContent='识别中…';let d;
  if(hasKey()){try{d=await chat([{role:'system',content:'你是医保基金飞行检查助手。从问题描述中抽取涉及的医疗服务项目/检查/药品名称（保持原文写法，去掉引号），判断问题类型（重复收费/过度检查/过度诊疗/其他之一），并为每个项目给出 1-3 个检索用的同义或规范名称。只输出 JSON：{"type":"...","items":[{"name":"...","aliases":["..."]}],"conditions":["描述中提到的疾病/指征"]}'},{role:'user',content:text}],true);d.by='DeepSeek'}
    catch(e){d=ruleAnalyze(text);d.warn=`AI 识别失败（${e.message}），已改用规则识别`}}
  else{d=ruleAnalyze(text);d.warn='未设置 DeepSeek Key，使用规则识别，请核对关键词'}
  state.items=(d.items||[]).map(i=>({name:i.name,aliases:i.aliases||[]}));if(['重复收费','过度检查','过度诊疗','其他'].includes(d.type))setType(d.type);renderChips();
  $('#analyzeNote').textContent=`由${d.by}识别${d.conditions?.length?' · 涉及指征：'+d.conditions.join('、'):''}${d.warn?' · '+d.warn:''}`;b.disabled=false}
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u}};
async function research(it,qtype){const s=getS();const base=it.name.replace(/[（(].*?[)）]/g,'').trim()||it.name;
  const kws=[...new Set([it.name,...(it.aliases||[]),...variants(it.name)].filter(k=>k&&k.length>=2))];
  const focus=qtype==='重复收费'?'项目内涵 除外内容 计价说明':'临床意义 适应证 诊断';
  const kb=kbSearch(kws.join(' ')+' '+focus,kws);const out={name:it.name,type:qtype,keywords:kws,web:[],kb,log:[]};
  if(!(s.api_key&&s.ds_search)){out.log.push(s.api_key?'网页搜索（收费）未开启，仅检索知识库':'未设置 Key，仅检索知识库');return out}
  const qs=qtype==='重复收费'?[`${base} 项目内涵 除外内容`,`"${base}" 医疗服务价格项目规范`]:[`${base} 临床意义 适应证`,`${base} 全国临床检验操作规范`];
  const seen=new Set(),res=[];
  for(const q of qs){try{const r=await dsSearch(q);out.log.push(`DeepSeek 网页搜索「${q}」：${r.length} 条`);for(const x of r)if(x.url&&!seen.has(x.url)){seen.add(x.url);res.push(x)}}catch(e){out.log.push(`DeepSeek 网页搜索「${q}」失败：${e.message}`)}}
  let fetched=0;
  out.web=await Promise.all(res.slice(0,10).map(async(x,i)=>{let text=x.content||'',title=x.title,via='搜索结果自带正文';
    if(s.ds_fetch&&i<s.max_pages&&text.length<1500){try{const f=await dsFetch(x.url);if(f.content){text=f.content;title=f.title||title;via='DeepSeek 网页抓取（收费）';fetched++}}catch(e){via='抓取失败：'+e.message}}
    if(!text)text=[x.summary,x.snippet].filter(Boolean).join('\n');
    const w={title,url:x.url,site:x.site_name,authority:x.authority,date:x.date,via,chars:text.length,paras:relevantParas(text,kws),ai_quotes:null};
    if(s.use_ai_clean&&w.paras.length&&i<s.max_pages){try{w.ai_quotes=await aiExcerpt(it.name,qtype,text,x.url)}catch(e){w.ai_error=e.message}}return w}));
  out.web.sort((a,b)=>(b.paras.length>0)-(a.paras.length>0));return out}
$('#btnGo').onclick=run;
async function run(){if($('#kwInput').value.trim()){addKw($('#kwInput').value);$('#kwInput').value=''}if(!state.items.length)return toast('请先识别或添加检索项目');
  const side=state.type==='重复收费'&&state.items.length>1;
  $('#results').innerHTML=`<div class="res-head"><h2>${side?'项目内涵并排对照':'依据检索结果'}</h2><div class="tip"><svg><use href="#i-alert"/></svg>工具只汇集原文，不作定性。AI 摘录须与原文核对后使用。</div></div><div class="grid">${state.items.map((it,i)=>`<div class="group" id="g${i}"><header><h3>${esc(it.name)}</h3></header><div class="loading"><span class="spin"></span>正在检索…</div></div>`).join('')}</div>`;
  state.items.forEach(async(it,i)=>{try{renderGroup(i,await research(it,state.type))}catch(e){$('#g'+i).querySelector('.loading').outerHTML=`<div class="empty">检索失败：${esc(e.message)}</div>`}})}
function hl(text,kws){let h=esc(text);[...kws].sort((a,b)=>b.length-a.length).forEach(k=>{if(k.length<2)return;h=h.split(esc(k)).join(`\u0001${esc(k)}\u0002`)});return h.replace(/\u0001/g,'<mark>').replace(/\u0002/g,'</mark>')}
let CL={},cid=0;
function quote(text,kws,src,item,ai){const id='c'+(cid++);CL[id]={text,source:src,item,ai};const on=clips.some(c=>c.text===text);
  return `<div class="quote">${hl(text,kws)}<div class="acts"><button class="icon-btn" data-copy="${id}"><svg><use href="#i-copy"/></svg>复制引文</button><button class="icon-btn ${on?'on':''}" data-fav="${id}"><svg><use href="#i-star"/></svg>${on?'已收藏':'收藏'}</button></div></div>`}
function kbHtml(list,kws,item){return list.map(k=>{const src=`《${k.book}》${k.page?'第 '+k.page+' 页':''}`;return `<div class="src"><div class="t"><b>${esc(src)}</b></div><div class="meta"><span>内部知识库</span><span>相关度 ${k.score}</span></div>${quote(k.text,kws,src,item,'')}</div>`}).join('')}
function renderGroup(i,d){const g=$('#g'+i),kws=d.keywords,good=d.web.filter(w=>w.paras.length),bad=d.web.filter(w=>!w.paras.length);
  const web=good.map(w=>{const src=`${w.title}，${w.url}`;return `<div class="src"><div class="t"><a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.title)}</a><a class="icon-btn" href="${esc(w.url)}" target="_blank" title="打开原网页"><svg><use href="#i-link"/></svg></a></div>
    <div class="meta"><span>${esc(w.site||host(w.url))}</span>${w.authority>=3?'<span class="badge ok">权威来源</span>':''}<span>${esc(w.via)}</span><span>${w.chars} 字</span></div>
    <div class="small muted">原文段落（程序按关键词定位，未经 AI 改写）</div>${w.paras.map(p=>quote(p,kws,src,d.name,'')).join('')}
    ${w.ai_quotes?`<div class="ai"><div class="h"><svg><use href="#i-spark"/></svg>AI 摘录 · 需核对原文</div>${w.ai_quotes.length?w.ai_quotes.map(q=>`<span class="badge ${q.verified?'ok':'warn'}">${q.verified?'已在原文中逐字找到':'未能在原文中逐字匹配，谨慎使用'}</span>`+quote(q.text,kws,src,d.name,q.verified?'AI 摘录，已校验':'AI 摘录，未校验')).join(''):'<div class="small muted">AI 未在正文中找到相关内容</div>'}</div>`:''}${w.ai_error?`<div class="small muted">AI 摘录失败：${esc(w.ai_error)}</div>`:''}</div>`}).join('');
  const webEmpty=d.web.length?'未在网页中定位到包含该项目名的段落':esc(d.log[d.log.length-1]||'无网页结果');
  g.innerHTML=`<header><h3>${esc(d.name)}<span class="tag">${d.type==='重复收费'?'项目内涵 / 除外内容':'临床意义 / 适应证'}</span></h3>
   <div class="tabs"><button class="${d.web.length?'on':''}" data-p="w">网页原文<b>${good.length}</b></button><button class="${d.web.length?'':'on'}" data-p="k">知识库<b>${d.kb.length}</b></button></div></header>
   <div class="pane ${d.web.length?'on':''}" data-p="w">${web||`<div class="empty">${webEmpty}</div>`}<details class="fold"><summary>检索过程</summary>${d.log.map(l=>`<div class="log">${esc(l)}</div>`).join('')}${bad.map(b=>`<div class="log">${esc(b.title)} · 无相关段落 · <a href="${esc(b.url)}" target="_blank">${esc(host(b.url))}</a></div>`).join('')}</details></div>
   <div class="pane ${d.web.length?'':'on'}" data-p="k">${kbHtml(d.kb,kws,d.name)||'<div class="empty">知识库中暂无命中。可在「知识库」上传规范或教材。</div>'}</div>`;
  g.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>g.querySelectorAll('[data-p]').forEach(x=>x.classList.toggle('on',x.dataset.p===b.dataset.p)));bindQuotes(g)}
const cite=c=>`“${c.text.trim()}”\n——出处：${c.source}${c.ai?'（'+c.ai+'）':''}`;
function copy(t){(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('已复制带出处的引文'),()=>{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove();toast('已复制带出处的引文')})}
function bindQuotes(root){root.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(cite(CL[b.dataset.copy])));
  root.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>{const c=CL[b.dataset.fav],k=clips.findIndex(x=>x.text===c.text);
    if(k>=0){clips.splice(k,1);b.classList.remove('on');b.lastChild.textContent='收藏'}else{clips.push(c);b.classList.add('on');b.lastChild.textContent='已收藏';toast('已加入核实记录')}saveClips()})}
function saveClips(){localStorage['ibf.clips']=JSON.stringify(clips);$('#clipCount').textContent=clips.length||''}
function groupClips(){const m={};clips.forEach(c=>(m[c.item]=m[c.item]||[]).push(c));return Object.entries(m).map(([name,cs])=>({name,clips:cs}))}
function renderClips(){const g=groupClips();$('#clipList').innerHTML=g.length?g.map(x=>`<div class="clip-group"><h3>${esc(x.name)}</h3>${x.clips.map(c=>`<div class="quote">${esc(c.text)}<div class="meta" style="margin:6px 0 0">出处：${esc(c.source)}${c.ai?' · '+esc(c.ai):''}</div><div class="acts" style="opacity:1"><button class="icon-btn" data-rm="${esc(c.text.slice(0,60))}"><svg><use href="#i-trash"/></svg>移除</button></div></div>`).join('')}</div>`).join(''):'<div class="empty">还没有收藏。在检索结果中点击「收藏」即可加入。</div>';
  $$('[data-rm]').forEach(b=>b.onclick=()=>{clips=clips.filter(c=>c.text.slice(0,60)!==b.dataset.rm);saveClips();renderClips()})}
$('#note').value=localStorage['ibf.note']||'';$('#note').oninput=e=>localStorage['ibf.note']=e.target.value;
$('#clearClips').onclick=()=>{if(confirm('清空全部收藏？')){clips=[];saveClips();renderClips()}};
function dl(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
const now=()=>new Date().toLocaleString('zh-CN',{hour12:false});
$('#expMd').onclick=()=>{const L=['# 飞检问题核实记录','',`生成时间：${now()}`,'','## 问题描述','',$('#desc').value||'（未填写）',''];
  groupClips().forEach(it=>{L.push(`## ${it.name}`,'');it.clips.forEach(c=>L.push('> '+c.text.trim().replace(/\n/g,'\n> '),'',`出处：${c.source}${c.ai?'（'+c.ai+'）':''}`,''))});
  if($('#note').value)L.push('## 核实意见','',$('#note').value,'');L.push('---','注：标注为 AI 摘录的内容须与原文核对后使用。');dl('核实记录.md',new Blob([L.join('\n')],{type:'text/markdown;charset=utf-8'}))};
$('#expDocx').onclick=()=>{const p=s=>esc(s).replace(/\n/g,'<br>');let h=`<h1>飞检问题核实记录</h1><p>生成时间：${now()}</p><h2>问题描述</h2><p>${p($('#desc').value||'（未填写）')}</p>`;
  groupClips().forEach(it=>{h+=`<h2>${esc(it.name)}</h2>`;it.clips.forEach(c=>h+=`<p class=q>${p(c.text.trim())}</p><p class=s>出处：${esc(c.source)}${c.ai?'（'+esc(c.ai)+'）':''}</p>`)});
  if($('#note').value)h+=`<h2>核实意见</h2><p>${p($('#note').value)}</p>`;h+='<p class=s>注：标注为 AI 摘录的内容须与原文核对后使用。</p>';
  const doc=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:微软雅黑;font-size:10.5pt}.q{border-left:3pt solid #2F6BFF;padding-left:8pt;color:#262D3A}.s{color:#666E7A;font-size:9pt}h1{font-size:18pt}h2{font-size:14pt}</style></head><body>${h}</body></html>`;
  dl('核实记录.doc',new Blob(['\ufeff'+doc],{type:'application/msword'}))};
async function renderBooks(){const b=await loadKB();$('#bookList').innerHTML=b.map(x=>`<div class="book"><svg><use href="#i-book"/></svg><div class="n"><b>${esc(x.title)}</b><span class="muted small">${x.pages?x.pages+' 页 · ':''}${x.chunks.length} 个片段${x.note?' · '+esc(x.note):''}</span></div><button class="icon-btn" data-bdel="${x.id}"><svg><use href="#i-trash"/></svg>删除</button></div>`).join('')||'<div class="empty">知识库为空</div>';
  $$('[data-bdel]').forEach(e=>e.onclick=async()=>{if(confirm('删除这本书及其索引？')){await tx('readwrite',s=>s.delete(e.dataset.bdel));renderBooks()}})}
async function upload(files){for(const f of files){$('#uploadMsg').innerHTML=`<span class="muted">正在解析《${esc(f.name)}》…</span>`;
  try{const d=await addBook(f);$('#uploadMsg').innerHTML=`<span style="color:#1C7A43">已加入《${esc(d.title)}》，${d.chunks.length} 个片段${d.note?'。'+esc(d.note):''}</span>`}catch(e){$('#uploadMsg').innerHTML=`<span style="color:#C2410C">《${esc(f.name)}》失败：${esc(e.message)}</span>`}}renderBooks()}
$('#file').onchange=e=>upload(e.target.files);const dr=$('#drop');
dr.ondragover=e=>{e.preventDefault();dr.classList.add('over')};dr.ondragleave=()=>dr.classList.remove('over');dr.ondrop=e=>{e.preventDefault();dr.classList.remove('over');upload(e.dataTransfer.files)};
$('#btnKbq').onclick=async()=>{const q=$('#kbq').value.trim();if(!q)return;if(!KB.chunks.length)await loadKB();const kws=q.split(/\s+/);$('#kbRes').innerHTML=kbHtml(kbSearch(q,kws),kws,q)||'<div class="empty">无命中</div>';bindQuotes($('#kbRes'))};
$('#kbq').onkeydown=e=>{if(e.key==='Enter')$('#btnKbq').click()};
function loadSettings(){const s=getS();$('#apiKey').value='';$('#apiKey').placeholder=s.api_key?'已保存 …'+s.api_key.slice(-4)+'（留空则不修改）':'sk-…';
  $('#thinking').checked=s.thinking;$('#temp').value=s.temperature;$('#useAi').checked=s.use_ai_clean;$('#dsSearch').checked=s.ds_search;$('#dsFetch').checked=s.ds_fetch;$('#maxPages').value=s.max_pages;syncS()}
function syncS(){$('#tempVal').textContent=(+$('#temp').value).toFixed(1);$('#mpVal').textContent=$('#maxPages').value;const t=$('#thinking').checked;$('#tempField').classList.toggle('disabled',t);$('#tempHint').textContent=t?'深度思考模式不支持温度参数，已停用。':'越低越稳定。摘录原文建议 0–0.3。'}
['#thinking','#temp','#maxPages'].forEach(s=>$(s).oninput=syncS);
$('#dsSearch').onchange=$('#dsFetch').onchange=e=>{if(e.target.checked&&!hasKey()&&!$('#apiKey').value)toast('需先填写 DeepSeek API Key 才会生效')};
function save(){const k=$('#apiKey').value.trim();const o={thinking:$('#thinking').checked,temperature:+$('#temp').value,use_ai_clean:$('#useAi').checked,ds_search:$('#dsSearch').checked,ds_fetch:$('#dsFetch').checked,max_pages:+$('#maxPages').value};if(k)o.api_key=k;setS(o);loadSettings()}
$('#btnSave').onclick=()=>{save();toast('设置已保存')};
$('#btnTest').onclick=async()=>{save();try{await chat([{role:'user',content:'回复：可用'}]);toast('DeepSeek 连接正常')}catch(e){toast('连接失败：'+e.message)}};
$('#btnWipe').onclick=async()=>{if(!confirm('清除 Key、设置、收藏与知识库？'))return;Object.keys(localStorage).filter(k=>k.startsWith('ibf.')).forEach(k=>localStorage.removeItem(k));await tx('readwrite',s=>s.clear());clips=[];saveClips();loadSettings();toast('已清除')};
renderChips();saveClips();keyTip();loadKB();
