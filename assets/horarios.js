const DEFAULT_COCINA=[
  {id:'jefferson',n:'Jefferson',c:'#e2622a'},
  {id:'jean',n:'Jean',c:'#2f7de1'},
  {id:'maria',n:'María',c:'#d6337f'},
  {id:'alberto',n:'Alberto',c:'#12905f'},
  {id:'alonso',n:'Alonso',c:'#7c4ddb'},
  {id:'edgar',n:'Edgar',c:'#b7791f'}
];
const DEFAULT_BARRA=[
  {id:'sabina',n:'Sabina',c:'#c2185b'},
  {id:'mariap',n:'Maria P',c:'#0277bd'},
  {id:'camila',n:'Camila',c:'#8a6008'},
  {id:'juan',n:'Juan',c:'#2e7d32'},
  {id:'angel',n:'Angel',c:'#6a1b9a'},
  {id:'juanpablo',n:'Juan Pablo',c:'#37474f'},
  {id:'ivan',n:'Ivan',c:'#d84315'},
  {id:'david',n:'David',c:'#00838f'}
];
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const CAT_LABELS={
  cocina:['Cocina','Producción'],
  barra:['Barra','Servicio']
};
const DEFAULT_N={cocina:[3,2],barra:[3,3]};
const LN_MIN=1,LN_MAX=6;
const S=7,E=24,HH=40,SNAP=.5,DUR=4,N=E-S;
const API='/api/shifts';
const EDIT_PASSWORD='1111';
let editMode=false;
try{editMode=sessionStorage.getItem('horarios-auth')==='1'}catch(e){}
let filterEmp=null;

let repairPending=0;   // turnos reubicados por repairLanes() que aún no se guardaron en la nube
let pulled=false;      // true cuando ya se hizo el primer pull (evita guardar datos locales viejos encima de los de la nube)
const clone=o=>JSON.parse(JSON.stringify(o));
function defaultDayLanes(g){return DEFAULT_N[g].map(n=>({n}))}
function defaultLanes(g){return Array.from({length:7},()=>defaultDayLanes(g))}
function normLanes(g,lanes){
  const catN=DEFAULT_N[g].length;
  if(Array.isArray(lanes)&&lanes.length===7&&lanes.every(d=>Array.isArray(d)&&d.length===catN)){
    return lanes.map(d=>d.map((x,i)=>({n:Math.max(LN_MIN,Math.min(LN_MAX,+x.n||DEFAULT_N[g][i]))})));
  }
  if(Array.isArray(lanes)&&lanes.length===catN&&lanes.every(x=>x&&typeof x.n==='number')){
    const base=lanes.map((x,i)=>Math.max(LN_MIN,Math.min(LN_MAX,+x.n||DEFAULT_N[g][i])));
    return Array.from({length:7},()=>base.map(n=>({n})));
  }
  return defaultLanes(g);
}
/* Un turno con carril que ya no existe ese día (p. ej. lane 7 cuando el día solo tiene 5 columnas)
   se dibuja fuera de su columna, no se ve, pero sigue bloqueando al empleado. Se reubica en el carril
   libre más cercano dentro del rango válido. Devuelve cuántos turnos reparó. */
function repairLanes(d){
  let n=0;
  ['cocina','barra'].forEach(g=>{
    const G=d[g];if(!G||!Array.isArray(G.shifts)||!Array.isArray(G.lanes))return;
    G.shifts.forEach(sh=>{
      if(!Number.isInteger(sh.day)||sh.day<0||sh.day>6||!G.lanes[sh.day])return;
      const Ld=G.lanes[sh.day].reduce((a,x)=>a+x.n,0);
      if(Number.isInteger(sh.lane)&&sh.lane>=0&&sh.lane<Ld)return;
      const want=Number.isFinite(sh.lane)?Math.max(0,Math.min(Ld-1,Math.round(sh.lane))):0;
      const ord=[...Array(Ld).keys()].sort((x,y)=>Math.abs(x-want)-Math.abs(y-want));
      const free=ord.find(k=>!G.shifts.some(o=>o!==sh&&o.day===sh.day&&o.lane===k&&sh.start<o.end&&sh.end>o.start));
      sh.lane=free===undefined?want:free;
      n++;
    });
  });
  return n;
}
function flushRepair(){
  if(!repairPending||!editMode||!pulled)return;
  const n=repairPending;repairPending=0;
  save();
  toast(n===1?'Se reparó 1 turno que estaba fuera de las columnas.':`Se repararon ${n} turnos que estaban fuera de las columnas.`);
}
function hasContent(d){return !!(d&&d.cocina&&d.barra&&(d.cocina.shifts.length||d.cocina.rests.length||d.barra.shifts.length||d.barra.rests.length))}
function migrate(raw){
  if(!raw)return null;
  if(Array.isArray(raw)){
    const order=['jefferson','jean','maria','alberto','alonso','edgar'];
    const out={
      cocina:{emp:clone(DEFAULT_COCINA),shifts:raw.map(s=>({...s,emp:order[s.emp]??s.emp})),rests:[],lanes:defaultLanes('cocina')},
      barra:{emp:clone(DEFAULT_BARRA),shifts:[],rests:[],lanes:defaultLanes('barra')}
    };
    const nf=repairLanes(out);if(nf)repairPending=nf;
    return out;
  }
  if(raw.cocina&&raw.barra&&Array.isArray(raw.cocina.shifts)&&Array.isArray(raw.barra.shifts)){
    raw.cocina.lanes=normLanes('cocina',raw.cocina.lanes);
    raw.barra.lanes=normLanes('barra',raw.barra.lanes);
    const nf=repairLanes(raw);if(nf)repairPending=nf;
    return raw;
  }
  return null;
}

let DATA=null;
try{DATA=migrate(JSON.parse(localStorage.getItem('horarios-v2')||'null'))}catch(e){}
if(!DATA){
  let legacy=null;try{legacy=JSON.parse(localStorage.getItem('horarios-v1')||'null')}catch(e){}
  DATA=migrate(legacy);
}
if(!DATA)DATA={cocina:{emp:clone(DEFAULT_COCINA),shifts:[],rests:[],lanes:defaultLanes('cocina')},barra:{emp:clone(DEFAULT_BARRA),shifts:[],rests:[],lanes:defaultLanes('barra')}};

let group='cocina';
let EMP=DATA.cocina.emp,shifts=DATA.cocina.shifts,rests=DATA.cocina.rests;
function dayTotal(day){return DATA[group].lanes[day].reduce((a,x)=>a+x.n,0)}
function maxDayTotal(g){return Math.max(...DATA[g].lanes.map(d=>d.reduce((a,x)=>a+x.n,0)))}

const save=()=>{
  try{localStorage.setItem('horarios-v2',JSON.stringify(DATA))}catch(e){}
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-edit-key':EDIT_PASSWORD},body:JSON.stringify(DATA)})
    .then(r=>{if(!r.ok)throw 0})
    .catch(()=>toast('Guardado en este dispositivo; no se pudo sincronizar con la nube.'));
};
async function pull(){
  try{
    const r=await fetch(API);if(!r.ok)return;
    const raw=await r.json();
    const remote=migrate(raw);
    if(remote&&hasContent(remote)){
      DATA=remote;
      try{localStorage.setItem('horarios-v2',JSON.stringify(DATA))}catch(e){}
      setGroup(group);
    }else if(hasContent(DATA)){
      save();
    }
  }catch(e){}
  pulled=true;
  flushRepair();
}

const $=s=>document.querySelector(s),sc=$('#sc'),grid=$('#grid'),pal=$('#pal'),msg=$('#msg'),empd=$('#empd');
const snap=h=>Math.round(h/SNAP)*SNAP,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=h=>{const m=Math.round(h*60),H=Math.floor(m/60),M=m%60,x=H%24;return (x%12||12)+(M?':'+String(M).padStart(2,'0'):'')+(x<12?'am':'pm')};
const dur=h=>Number.isInteger(h)?''+h:h.toFixed(1);
const lab=h=>((h%24)%12||12)+(h%24<12?' AM':' PM');
let tm;function toast(t){msg.textContent=t;clearTimeout(tm);tm=setTimeout(()=>msg.textContent='',2800)}

grid.style.setProperty('--n',N);
function subHTML(g,day){
  return DATA[g].lanes[day].map((x,i)=>`<div class="subcat" style="flex:${x.n} ${x.n} 0%" data-cat="${i}"><button type="button" class="lnbtn lnm" data-cat="${i}" aria-label="Quitar columna de ${CAT_LABELS[g][i]} (${DAYS[day]})" ${x.n<=LN_MIN?'disabled':''}>−</button><b>${CAT_LABELS[g][i]}</b><button type="button" class="lnbtn lnp" data-cat="${i}" aria-label="Añadir columna a ${CAT_LABELS[g][i]} (${DAYS[day]})" ${x.n>=LN_MAX?'disabled':''}>+</button></div>`).join('');
}
grid.innerHTML='<div class="corner"></div>'+DAYS.map((d,i)=>`<div class="dh" style="grid-column:${i+2}"><span class="f">${d}</span><span class="s">${d.slice(0,3)}</span></div>`).join('')+
 DAYS.map((_,i)=>`<div class="rest" data-day="${i}" style="grid-column:${i+2}"></div>`).join('')+
 DAYS.map((_,i)=>`<div class="sub" data-day="${i}" style="grid-column:${i+2}">${subHTML('cocina',i)}</div>`).join('')+
 '<div class="gut">'+Array.from({length:N},(_,i)=>`<div>${lab(S+i)}</div>`).join('')+'</div>'+
 DAYS.map((_,i)=>`<div class="body${i%2?' alt':''}" data-day="${i}" style="grid-column:${i+2}"></div>`).join('')+'<div id="ov"></div><div id="divs"></div>';
const ov=$('#ov'),divs=$('#divs');
function updateDivsBackground(g){
  const dayPct=100/7,parts=[];
  for(let d=0;d<7;d++){
    const lanes=DATA[g].lanes[d],total=lanes.reduce((a,x)=>a+x.n,0);
    let acc=0;
    for(let c=0;c<lanes.length-1;c++){
      acc+=lanes[c].n;
      const p=d*dayPct+(acc/total)*dayPct;
      parts.push(`linear-gradient(to right,transparent 0,transparent calc(${p}% - 1px),var(--line) calc(${p}% - 1px),var(--line) calc(${p}% + 1px),transparent calc(${p}% + 1px),transparent 100%)`);
    }
  }
  const dayDivider='repeating-linear-gradient(to right,rgba(0,0,0,.55) 0,rgba(0,0,0,.55) 1px,var(--dv) 1px,var(--dv) 4px,rgba(255,255,255,.4) 4px,rgba(255,255,255,.4) 5px,transparent 5px,transparent calc(100%/7))';
  divs.style.backgroundImage=[dayDivider,...parts].join(',');
}
function applyGroupLayout(g){
  document.querySelectorAll('.sub').forEach(el=>{const day=+el.dataset.day;el.innerHTML=subHTML(g,day)});
  document.querySelectorAll('.body').forEach(el=>{const day=+el.dataset.day;el.style.setProperty('--L',DATA[g].lanes[day].reduce((a,x)=>a+x.n,0))});
  updateDivsBackground(g);
}
applyGroupLayout(group);
document.addEventListener('contextmenu',e=>e.preventDefault());

function buildPalette(){
  pal.innerHTML='<div class="chip allchip" id="allBtn">Todos</div>'+
    EMP.map(e=>`<div class="chip" data-id="${e.id}" style="background:${e.c}">${e.n}<small id="t-${e.id}">0 h</small></div>`).join('');
}

function locate(x,y){
  const s=sc.getBoundingClientRect(),r=ov.getBoundingClientRect();
  if(y<s.top||y>s.bottom||x<r.left||x>=r.right||x<s.left)return null;
  const dayW=r.width/7,day=clamp(Math.floor((x-r.left)/dayW),0,6),Ld=dayTotal(day);
  const lane=clamp(Math.floor((x-(r.left+day*dayW))/dayW*Ld),0,Ld-1);
  return{day,lane,h:S+(y-r.top)/HH};
}
function restDay(x,y){
  for(const c of document.querySelectorAll('.rest')){
    const r=c.getBoundingClientRect();
    if(x>=r.left&&x<r.right&&y>=r.top&&y<=r.bottom)return +c.dataset.day;
  }
  return null;
}
function fit(s,day,lane,a,b){
  if(shifts.some(o=>o.id!==s.id&&o.emp===s.emp&&o.day===day&&a<o.end&&b>o.start))return -2;
  const Ld=dayTotal(day);
  const ord=[...Array(Ld).keys()].sort((x,y)=>Math.abs(x-lane)-Math.abs(y-lane));
  const l=ord.find(k=>!shifts.some(o=>o.id!==s.id&&o.day===day&&o.lane===k&&a<o.end&&b>o.start));
  return l===undefined?-1:l;
}
const free=(s,a,b)=>!shifts.some(o=>o.id!==s.id&&o.day===s.day&&a<o.end&&b>o.start&&(o.lane===s.lane||o.emp===s.emp));

const nodes=new Map();
function render(){
  const ids=new Set(shifts.map(s=>s.id));
  nodes.forEach((n,id)=>{if(!ids.has(id)){n.remove();nodes.delete(id)}});
  shifts.forEach(s=>{
    const e=EMP.find(x=>x.id===s.emp);if(!e)return;
    let n=nodes.get(s.id);
    if(!n){
      n=document.createElement('div');n.className='blk';n.sid=s.id;
      n.innerHTML=`<div class="in" data-i="${e.n[0]}" style="background:${e.c}"><div class="rz t" data-m="t"></div><b>${e.n}</b><span></span><button class="x" aria-label="Quitar turno">×</button><div class="rz b" data-m="b"></div></div>`;
      ov.appendChild(n);nodes.set(s.id,n);
    }
    const Ld=dayTotal(s.day),dayPct=100/7,ln=Math.max(0,Math.min(Ld-1,s.lane));
    n.style.cssText=`left:${s.day*dayPct+(ln/Ld)*dayPct}%;width:${dayPct/Ld}%;top:${(s.start-S)*HH}px;height:${(s.end-s.start)*HH}px`;
    n.querySelector('span').innerHTML=fmt(s.start)+'<br>'+fmt(s.end);
    n.style.display=(!editMode&&filterEmp&&s.emp!==filterEmp)?'none':'';
  });
  EMP.forEach(e=>{
    const h=shifts.filter(s=>s.emp===e.id).reduce((a,s)=>a+s.end-s.start,0);
    const el=$('#t-'+e.id);if(el)el.textContent=dur(h)+' h';
  });
}
function renderRests(){
  document.querySelectorAll('.rest').forEach(c=>{
    const day=+c.dataset.day;
    const chips=rests.filter(r=>r.day===day&&(editMode||!filterEmp||r.emp===filterEmp)).map(r=>{
      const e=EMP.find(x=>x.id===r.emp);if(!e)return '';
      return `<span class="rchip" data-emp="${e.id}" data-day="${day}" style="background:${e.c}" data-i="${e.n[0]}"><i>${e.n}</i></span>`;
    }).join('');
    c.innerHTML='<span class="rlbl">Descanso</span>'+chips;
  });
}
function addRest(empId,day,name){
  if(rests.some(r=>r.emp===empId&&r.day===day))return toast(`${name} ya está marcado descansando ese día.`);
  rests.push({emp:empId,day});save();renderRests();
}
grid.addEventListener('click',ev=>{
  if(!editMode||mode!=='plan')return;
  const rc=ev.target.closest('.rchip');if(!rc)return;
  const emp=rc.dataset.emp,day=+rc.dataset.day;
  const idx=rests.findIndex(r=>r.emp===emp&&r.day===day);
  if(idx>-1){rests.splice(idx,1);save();renderRests()}
});

function adjustLane(day,catIdx,delta){
  const lanes=DATA[group].lanes[day],cat=lanes[catIdx];if(!cat)return;
  const newN=Math.max(LN_MIN,Math.min(LN_MAX,cat.n+delta));
  if(newN===cat.n)return;
  const start=lanes.slice(0,catIdx).reduce((a,c)=>a+c.n,0);
  if(delta<0){
    const removedLane=start+cat.n-1;
    if(shifts.some(s=>s.day===day&&s.lane===removedLane))return toast(`La última columna de "${CAT_LABELS[group][catIdx]}" el ${DAYS[day]} tiene turnos asignados. Muévelos o bórralos antes de quitarla.`);
    shifts.forEach(s=>{if(s.day===day&&s.lane>removedLane)s.lane--});
  }else{
    const insertAt=start+cat.n;
    shifts.forEach(s=>{if(s.day===day&&s.lane>=insertAt)s.lane++});
  }
  cat.n=newN;
  applyGroupLayout(group);save();render();zoom();
}
grid.addEventListener('click',ev=>{
  if(!editMode||mode!=='plan')return;
  const b=ev.target.closest('.lnbtn');if(!b||b.disabled)return;
  const subEl=b.closest('.sub');if(!subEl)return;
  adjustLane(+subEl.dataset.day,+b.dataset.cat,b.classList.contains('lnp')?1:-1);
});

function setGroup(g){
  group=g;
  EMP=DATA[g].emp;shifts=DATA[g].shifts;rests=DATA[g].rests;
  filterEmp=null;
  nodes.forEach(n=>n.remove());nodes.clear();
  applyGroupLayout(g);
  buildPalette();
  document.querySelectorAll('#grp button').forEach(b=>b.classList.toggle('on',b.dataset.g===g));
  if(mode==='real')renderReal();else{render();renderRests()}
  zoom();
}

/* ---- Control de horario: marcajes reales de entrada/salida (solo admin) ---- */
const ATT_API='/api/attendance';
let mode='plan';
let ATT=[];                     // marcajes crudos devueltos por la API (hasta ~45 días)
let REAL={cocina:[],barra:[]};  // intervalos ya calculados para la semana que se está viendo
let selWeek=null;               // null = semana actual (auto); Date = lunes de una semana fija elegida
const realNodes=new Map();
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function mondayOfWeek(d=new Date()){
  const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  x.setDate(x.getDate()-((x.getDay()+6)%7)); // lunes=0 ... domingo=6
  return x;
}
function activeMonday(){return selWeek||mondayOfWeek(new Date())}
function formatWeek(monday){
  const sun=new Date(monday);sun.setDate(sun.getDate()+6);
  const d1=monday.getDate(),d2=sun.getDate();
  return monday.getMonth()===sun.getMonth()
    ?`${d1} al ${d2} de ${MESES[monday.getMonth()]}`
    :`${d1} de ${MESES[monday.getMonth()]} al ${d2} de ${MESES[sun.getMonth()]}`;
}
function buildWeekOptions(){
  const curMon=mondayOfWeek(new Date());
  const weeksMap=new Map([[curMon.getTime(),curMon]]);
  ATT.forEach(r=>{
    const ts=new Date(r.ts);if(isNaN(ts))return;
    const m=mondayOfWeek(ts);weeksMap.set(m.getTime(),m);
  });
  const weeks=[...weeksMap.values()].sort((a,b)=>b-a);
  const sel=$('#weekSel');
  const prevValue=selWeek===null?'auto':String(selWeek.getTime());
  sel.innerHTML=weeks.map(m=>{
    const isCur=m.getTime()===curMon.getTime();
    return `<option value="${isCur?'auto':m.getTime()}">${formatWeek(m)}${isCur?' (actual)':''}</option>`;
  }).join('');
  sel.value=[...sel.options].some(o=>o.value===prevValue)?prevValue:'auto';
}
function dayIndexOf(date,monday){
  const diff=Math.round((new Date(date.getFullYear(),date.getMonth(),date.getDate())-monday)/86400000);
  return diff>=0&&diff<7?diff:null;
}
function computeReal(){
  const monday=activeMonday(),now=new Date(),todayIdx=dayIndexOf(now,monday);
  const byKey=new Map();
  ATT.forEach(r=>{
    const ts=new Date(r.ts);if(isNaN(ts))return;
    const day=dayIndexOf(ts,monday);if(day===null)return;
    const k=r.group+'|'+r.empId+'|'+day;
    if(!byKey.has(k))byKey.set(k,[]);
    byKey.get(k).push({...r,dt:ts});
  });
  const out={cocina:[],barra:[]};
  byKey.forEach((list,k)=>{
    const[g,empId,dayStr]=k.split('|'),day=+dayStr;
    if(!out[g])return;
    list.sort((a,b)=>a.dt-b.dt);
    let open=null;
    list.forEach(r=>{
      const h=r.dt.getHours()+r.dt.getMinutes()/60;
      if(r.type==='entrada'){
        if(!open)open={start:clamp(h,S,E)};
      }else if(r.type==='salida'&&open){
        out[g].push({id:k+'@'+open.start,emp:empId,day,start:open.start,end:clamp(Math.max(h,open.start+SNAP),S,E),open:false});
        open=null;
      }
    });
    if(open){
      const isToday=day===todayIdx;
      const end=isToday?clamp(Math.max(now.getHours()+now.getMinutes()/60,open.start+SNAP),S,E):E;
      out[g].push({id:k+'@'+open.start,emp:empId,day,start:open.start,end,open:true,missing:!isToday});
    }
  });
  REAL=out;
}
function packLanesFor(g){
  // asigna carriles evitando choques, respetando cuántas columnas tiene ese día en ese grupo
  REAL[g].forEach(iv=>{
    const Ld=DATA[g].lanes[iv.day].reduce((a,x)=>a+x.n,0);
    const used=REAL[g].filter(o=>o!==iv&&o.day===iv.day&&iv.start<o.end&&iv.end>o.start).map(o=>o.lane);
    let lane=0;while(used.includes(lane)&&lane<Ld-1)lane++;
    iv.lane=lane;
  });
}
async function loadReal(){
  try{
    const r=await fetch(ATT_API);if(!r.ok)throw 0;
    ATT=await r.json()||[];
  }catch(e){toast('No se pudo actualizar el control de horario desde la nube.')}
  buildWeekOptions();
  computeReal();
  packLanesFor('cocina');packLanesFor('barra');
  if(mode==='real'){renderReal();updateHint()}
}
function renderReal(){
  const list=REAL[group]||[];
  const ids=new Set(list.map(iv=>iv.id));
  realNodes.forEach((n,id)=>{if(!ids.has(id)){n.remove();realNodes.delete(id)}});
  const dayPct=100/7;
  list.forEach(iv=>{
    const e=EMP.find(x=>x.id===iv.emp);if(!e)return;
    let n=realNodes.get(iv.id);
    if(!n){
      n=document.createElement('div');n.className='blk real';
      n.innerHTML=`<div class="in" data-i="${e.n[0]}" style="background:${e.c}"><b></b><span></span><span class="tag"></span></div>`;
      ov.appendChild(n);realNodes.set(iv.id,n);
    }
    const Ld=dayTotal(iv.day);
    n.classList.toggle('open',!!iv.open);
    n.style.cssText=`left:${iv.day*dayPct+(iv.lane/Ld)*dayPct}%;width:${dayPct/Ld}%;top:${(iv.start-S)*HH}px;height:${(iv.end-iv.start)*HH}px`;
    n.querySelector('b').textContent=e.n;
    n.querySelector('span').innerHTML=fmt(iv.start)+' – '+fmt(iv.end);
    n.querySelector('.tag').textContent=iv.open?(iv.missing?'Sin salida':'En curso'):'';
  });
  EMP.forEach(e=>{
    const h=list.filter(iv=>iv.emp===e.id).reduce((a,iv)=>a+(iv.end-iv.start),0);
    const el=$('#t-'+e.id);if(el)el.textContent=dur(h)+' h';
  });
}
function updateHint(){
  $('#hint').textContent = mode==='real'
    ? `Horas reales de la semana del ${formatWeek(activeMonday())}, separadas por grupo. Solo lectura — los marcajes se registran desde "Marcar horario" (index.html). Un borde punteado indica un turno sin cerrar.`
    : editMode
      ? 'Arrastra un empleado a un día. Estira los bordes del bloque para cambiar sus horas. Para un turno partido, suelta al mismo empleado otra vez en ese día. Suelta sobre "Descanso" (arriba de cada día) para marcar que ese empleado libra ese día.'
      : 'Toca tu nombre arriba para ver solo tu horario. Toca "Todos" para volver a ver a todos.';
}
function setMode(m){
  mode=m;
  document.querySelectorAll('#mode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  document.body.classList.toggle('attmode',m==='real');
  $('#realRefresh').style.display=m==='real'?'':'none';
  $('#weekSel').style.display=m==='real'?'':'none';
  updateHint();
  if(m==='real'){
    nodes.forEach(n=>n.remove());nodes.clear();
    loadReal();
  }else{
    realNodes.forEach(n=>n.remove());realNodes.clear();
    render();renderRests();
  }
}
$('#mode').addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b||!editMode||b.dataset.m===mode)return;
  setMode(b.dataset.m);
});
$('#realRefresh').onclick=()=>{if(mode==='real')loadReal()};
$('#weekSel').addEventListener('change',()=>{
  const v=$('#weekSel').value;
  selWeek=v==='auto'?null:new Date(+v);
  computeReal();packLanesFor('cocina');packLanesFor('barra');renderReal();updateHint();
});
$('#grp').addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b||b.dataset.g===group)return;
  setGroup(b.dataset.g);
});

function applyFilter(){
  document.querySelectorAll('.chip[data-id]').forEach(c=>c.classList.toggle('sel',c.dataset.id===filterEmp));
  const all=$('#allBtn');if(all)all.classList.toggle('sel',!filterEmp);
  render();renderRests();
}
pal.addEventListener('click',ev=>{
  if(editMode)return;
  if(ev.target.closest('.allchip')){filterEmp=null;applyFilter();return;}
  const chip=ev.target.closest('.chip[data-id]');if(!chip)return;
  const id=chip.dataset.id;
  filterEmp=(filterEmp===id)?null:id;
  applyFilter();
});

/* seguimiento del puntero (evita que el dedo desplace la página) */
const stop=e=>{if(e.cancelable)e.preventDefault()};
function track(mv,end){
  const up=e=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);removeEventListener('touchmove',stop);end(e)};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up);
  addEventListener('touchmove',stop,{passive:false});
}

/* empleados de arriba -> semana o descanso */
pal.addEventListener('pointerdown',ev=>{
  if(!editMode||mode!=='plan')return;
  const chip=ev.target.closest('.chip');if(!chip)return;ev.preventDefault();
  const id=chip.dataset.id,e=EMP.find(x=>x.id===id);if(!e)return;
  const g=document.createElement('div');
  g.className='ghost';g.textContent=e.n;g.style.background=e.c;document.body.appendChild(g);
  try{chip.setPointerCapture(ev.pointerId)}catch(_){}
  let overRest=null;
  const pos=m=>{
    g.style.left=m.clientX+'px';g.style.top=(m.clientY-34)+'px';
    overRest=restDay(m.clientX,m.clientY);
    document.querySelectorAll('.rest').forEach(c=>c.classList.toggle('hover',overRest!==null&&+c.dataset.day===overRest));
  };
  pos(ev);
  track(pos,m=>{
    g.remove();document.querySelectorAll('.rest').forEach(c=>c.classList.remove('hover'));
    if(m.type==='pointercancel')return;
    if(overRest!==null)return addRest(id,overRest,e.n);
    const loc=locate(m.clientX,m.clientY);if(!loc)return;
    const a=snap(clamp(loc.h,S,E-DUR)),nx=Math.min(a+DUR,...shifts.filter(o=>o.emp===id&&o.day===loc.day&&o.start>=a).map(o=>o.start));
    if(nx-a<SNAP)return toast(`${e.n} ya tiene turno a esa hora. Elige otro hueco.`);
    const s={id:Date.now()+Math.random(),emp:id,day:loc.day,lane:0,start:a,end:nx};
    const l=fit(s,loc.day,loc.lane,s.start,s.end);
    if(l===-2)return toast(`${e.n} ya tiene turno a esa hora ese día.`);
    if(l<0)return toast('No hay espacio libre a esa hora en ese día.');
    s.lane=l;shifts.push(s);save();render();
  });
});

/* mover o estirar un turno */
ov.addEventListener('pointerdown',ev=>{
  if(!editMode||mode!=='plan')return;
  const n=ev.target.closest('.blk');if(!n||ev.target.closest('.x'))return;
  const s=shifts.find(o=>o.id===n.sid);if(!s)return;
  ev.preventDefault();
  const dm=ev.target.dataset.m||'m',l0=locate(ev.clientX,ev.clientY),off=l0?l0.h-s.start:0;
  n.classList.add('drag');try{n.setPointerCapture(ev.pointerId)}catch(_){}
  track(m=>{
    if(dm==='m'){
      const loc=locate(m.clientX,m.clientY);if(!loc)return;
      const d=s.end-s.start,a=snap(clamp(loc.h-off,S,E-d)),l=fit(s,loc.day,loc.lane,a,a+d);
      if(l>=0){s.day=loc.day;s.lane=l;s.start=a;s.end=a+d}
    }else{
      const h=snap(S+(m.clientY-ov.getBoundingClientRect().top)/HH);let a=s.start,b=s.end;
      if(dm==='t')a=clamp(h,S,s.end-SNAP);else b=clamp(h,s.start+SNAP,E);
      if(free(s,a,b)){s.start=a;s.end=b}
    }
    render();
  },()=>{n.classList.remove('drag');save();render()});
});
ov.addEventListener('click',ev=>{
  if(!editMode||mode!=='plan')return;
  const x=ev.target.closest('.x');if(!x)return;
  const id=x.closest('.blk').sid;
  const idx=shifts.findIndex(o=>o.id===id);if(idx>-1)shifts.splice(idx,1);
  save();render();
});
/* menú "⋯" (acciones de admin) y ayuda */
const menu=$('#menu'),menuBtn=$('#menuBtn'),helpBtn=$('#helpBtn'),hintEl=$('#hint');
function closeMenu(){menu.hidden=true;menuBtn.setAttribute('aria-expanded','false')}
menuBtn.onclick=ev=>{ev.stopPropagation();const open=menu.hidden;menu.hidden=!open;menuBtn.setAttribute('aria-expanded',String(open))};
menu.addEventListener('click',closeMenu);
document.addEventListener('click',ev=>{if(!menu.hidden&&!ev.target.closest('.acts'))closeMenu()});
helpBtn.onclick=()=>{hintEl.hidden=!hintEl.hidden;helpBtn.setAttribute('aria-expanded',String(!hintEl.hidden))};
$('#clr').onclick=()=>{if(!editMode||mode!=='plan')return;if(shifts.length&&confirm('¿Vaciar todos los turnos de la semana (solo de este grupo)?')){shifts.length=0;save();render()}};

/* administrar empleados del grupo activo */
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'')||'e'}
function uniqueId(base){let id=base,n=2;while(EMP.some(e=>e.id===id)){id=base+n;n++}return id}
function hslHex(h,s=55,l=38){
  s/=100;l/=100;
  const k=n=>(n+h/30)%12;
  const a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  const toHex=x=>Math.round(255*x).toString(16).padStart(2,'0');
  return '#'+toHex(f(0))+toHex(f(8))+toHex(f(4));
}
function renderEmpList(){
  $('#empList').innerHTML=EMP.map(e=>`<div class="emprow"><span class="dot" style="background:${e.c}"></span><span>${e.n}</span><button class="clr rm" data-id="${e.id}" type="button">Quitar</button></div>`).join('')||'<p class="hint">No hay empleados en este grupo.</p>';
}
$('#empBtn').onclick=()=>{
  if(!editMode||mode!=='plan')return;
  $('#empdTitle').textContent='Empleados — '+(group==='cocina'?'Cocina':'Barra y servicio');
  renderEmpList();
  $('#empColor').value=hslHex((EMP.length*47)%360);
  empd.showModal();
};
$('#empClose').onclick=()=>empd.close();
empd.addEventListener('click',ev=>{if(ev.target===empd)empd.close()});
$('#empList').addEventListener('click',ev=>{
  if(!editMode||mode!=='plan')return;
  const b=ev.target.closest('.rm');if(!b)return;
  const id=b.dataset.id,e=EMP.find(x=>x.id===id);if(!e)return;
  if(!confirm(`¿Quitar a ${e.n}? También se borran sus turnos y descansos guardados en este grupo.`))return;
  const idx=EMP.findIndex(x=>x.id===id);if(idx>-1)EMP.splice(idx,1);
  for(let i=shifts.length-1;i>=0;i--)if(shifts[i].emp===id)shifts.splice(i,1);
  for(let i=rests.length-1;i>=0;i--)if(rests[i].emp===id)rests.splice(i,1);
  save();buildPalette();render();renderRests();renderEmpList();
  devFetch('POST',{action:'reset',key:group+':'+id}).catch(()=>{});
});
$('#empForm').addEventListener('submit',ev=>{
  ev.preventDefault();
  if(!editMode||mode!=='plan')return;
  const name=$('#empName').value.trim();if(!name)return;
  const color=$('#empColor').value||'#4a6fa5';
  const id=uniqueId(slug(name));
  EMP.push({id,n:name,c:color});
  $('#empName').value='';
  save();buildPalette();renderEmpList();
  $('#empColor').value=hslHex((EMP.length*47)%360);
});

/* candado de edición */
function applyEditMode(){
  document.body.classList.toggle('editing',editMode);
  document.body.classList.toggle('view-only',!editMode);
  $('#editBtn').textContent=editMode?'Bloquear':'Editar';
  closeMenu();
  $('#modeRow').style.display=editMode?'':'none';
  if(!editMode&&mode==='real')setMode('plan'); // el control de horario es solo para admin
  updateHint();
  flushRepair();
  document.querySelectorAll('.chip[data-id]').forEach(c=>c.classList.toggle('sel',!editMode&&c.dataset.id===filterEmp));
  const all=$('#allBtn');if(all)all.classList.toggle('sel',!editMode&&!filterEmp);
  render();renderRests();
}
const pwd=$('#pwd');
$('#editBtn').onclick=()=>{
  if(editMode){
    editMode=false;try{sessionStorage.removeItem('horarios-auth')}catch(e){}
    applyEditMode();
    return;
  }
  $('#pwdInput').value='';
  pwd.showModal();
  setTimeout(()=>$('#pwdInput').focus(),50);
};
$('#pwdClose').onclick=()=>pwd.close();
pwd.addEventListener('click',ev=>{if(ev.target===pwd)pwd.close()});
$('#pwdForm').addEventListener('submit',ev=>{
  ev.preventDefault();
  if($('#pwdInput').value===EDIT_PASSWORD){
    editMode=true;try{sessionStorage.setItem('horarios-auth','1')}catch(e){}
    applyEditMode();pwd.close();
  }else{
    toast('Clave incorrecta.');
    $('#pwdInput').value='';$('#pwdInput').focus();
  }
});
applyEditMode();

/* Librería QR cargada aparte, ver vendor/qrcode.min.js (carga antes que este archivo) */
const locd=$('#locd');
function drawLocQr(token){
  const url=location.origin+'/index.html?loc='+encodeURIComponent(token);
  const q=qrcode(0,'M');q.addData(url);q.make();
  $('#locQr').innerHTML=q.createSvgTag({cellSize:6,margin:0,scalable:true});
  const svg=$('#locQr svg');if(svg){svg.style.width='min(260px,70vw)';svg.style.height='auto'}
  $('#locUrl').textContent=url;
}
async function locFetch(method){
  const r=await fetch('/api/location',{method,headers:{'x-edit-key':EDIT_PASSWORD}});
  if(!r.ok)throw new Error('http '+r.status);
  return (await r.json()).token;
}
$('#locBtn').onclick=async()=>{
  if(!editMode)return;
  $('#locQr').innerHTML='<span class="hint">Cargando…</span>';$('#locUrl').textContent='';
  locd.showModal();
  try{drawLocQr(await locFetch('GET'))}
  catch(e){$('#locQr').innerHTML='<span class="hint">No se pudo obtener el código. ¿Está desplegada la API y configurado Redis?</span>'}
};
$('#locRegen').onclick=async()=>{
  if(!confirm('Al regenerar, el QR impreso actual deja de funcionar y habrá que imprimir y pegar el nuevo. ¿Continuar?'))return;
  try{drawLocQr(await locFetch('POST'))}catch(e){toast('No se pudo regenerar el código.')}
};
$('#locPrint').onclick=()=>{
  const w=window.open('','_blank');if(!w)return;
  w.document.write('<title>QR del local</title><body style="font-family:system-ui;text-align:center;padding:40px"><h1>HORARIOS CASAPAELLA</h1><p style="font-size:20px">Escanea este QR con la cámara de tu celular para marcar tu entrada o salida</p>'+$('#locQr').innerHTML.replace('style="','style="max-width:420px;')+'</body>');
  w.document.close();w.focus();w.print();
};
$('#locClose').onclick=()=>locd.close();
locd.addEventListener('click',ev=>{if(ev.target===locd)locd.close()});

/* Celulares registrados por empleado (ver api/devices.js) */
const devd=$('#devd');
let devState={devices:{},invites:{}};
const escH=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function devFetch(method,body){
  const r=await fetch('/api/devices',{method,headers:{'x-edit-key':EDIT_PASSWORD,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw new Error('http '+r.status);
  return r.json();
}
function devEmps(){return ['cocina','barra'].flatMap(g=>(DATA[g].emp||[]).map(e=>({key:g+':'+e.id,g,e})))}
function devRender(){
  $('#devList').innerHTML=devEmps().map(({key,g,e})=>{
    const d=devState.devices[key],inv=devState.invites[key];
    const st=d?'✓ Celular registrado':inv?'Código pendiente':'Sin registrar';
    return `<div class="emprow"><span class="dot" style="background:${e.c}"></span><span>${escH(e.n)}<small class="hint" style="display:block;font-weight:400">${g==='cocina'?'Cocina':'Barra y servicio'} · ${st}</small></span><button class="clr" type="button" data-a="inv" data-k="${escH(key)}">Código</button>${d||inv?`<button class="clr rm" type="button" data-a="rst" data-k="${escH(key)}">Restablecer</button>`:''}</div>`;
  }).join('')||'<p class="hint">No hay empleados.</p>';
}
function devShowCode(key,code){
  const e=devEmps().find(x=>x.key===key);
  const url=location.origin+'/index.html?reg='+encodeURIComponent(code);
  const q=qrcode(0,'M');q.addData(url);q.make();
  $('#devShowName').textContent=e?e.e.n:'';
  $('#devShowCode').textContent=code.slice(0,4)+'-'+code.slice(4);
  $('#devShowQr').innerHTML=q.createSvgTag({cellSize:5,margin:0,scalable:true});
  const svg=$('#devShowQr svg');if(svg){svg.style.width='min(200px,60vw)';svg.style.height='auto'}
  $('#devShowUrl').textContent=url;
  $('#devShow').style.display='';
}
async function devLoad(){
  try{devState=await devFetch('GET');devRender()}
  catch(e){$('#devList').innerHTML='<span class="hint">No se pudo cargar. ¿Está desplegada la API y configurado Redis?</span>'}
}
$('#devBtn').onclick=()=>{
  if(!editMode)return;
  $('#devShow').style.display='none';$('#devList').innerHTML='<span class="hint">Cargando…</span>';
  devd.showModal();devLoad();
};
$('#devList').addEventListener('click',async ev=>{
  if(!editMode)return;
  const b=ev.target.closest('button[data-a]');if(!b)return;
  const key=b.dataset.k,e=devEmps().find(x=>x.key===key);if(!e)return;
  try{
    if(b.dataset.a==='inv'){
      const r=await devFetch('POST',{action:'invite',key,name:e.e.n});
      devState.invites[key]={code:r.code,exp:r.exp};devRender();devShowCode(key,r.code);
    }else{
      if(!confirm(`¿Restablecer el celular de ${e.e.n}? Podrá marcar como antes hasta que registre otro.`))return;
      await devFetch('POST',{action:'reset',key});
      delete devState.devices[key];delete devState.invites[key];devRender();$('#devShow').style.display='none';
    }
  }catch(err){toast('No se pudo completar la acción.')}
});
$('#devClose').onclick=()=>devd.close();
devd.addEventListener('click',ev=>{if(ev.target===devd)devd.close()});

/* Zoom de la semana con pinch (dos dedos) o Ctrl+rueda / pellizco del trackpad.
   `zw` = ancho mínimo de cada día en px; 0 = ajustar la semana a la pantalla ("ver semana"). */
const ZMAX=312;let zw=0;
const MIN_LANE=37; // px mínimos por carril para que se lea nombre + horario (por debajo de 36 se pasa a letras)
const lanesAll=()=>Math.max(maxDayTotal('cocina'),maxDayTotal('barra')); // carriles del grupo que más tiene
function zoom(w){
  if(w!==undefined)zw=w;
  const small=window.innerWidth<700;
  let cw=zw;
  // Pantallas medianas/grandes: cada carril mide al menos MIN_LANE px, así ambos grupos siempre muestran nombre + horario
  // (si no cabe, la planilla se desplaza en horizontal). Celular: el zoom es continuo desde "semana completa" (0).
  if(!small)cw=Math.max(cw,maxDayTotal(group)*MIN_LANE);
  grid.style.setProperty('--cw',cw+'px');grid.style.minWidth=cw?'max-content':'0';
  // Celular: Cocina y Barra cambian de letras a nombre+horario en el MISMO ancho (el del grupo con más carriles),
  // para que nunca uno se vea en letras y el otro no.
  requestAnimationFrame(()=>{
    const dw=ov.clientWidth/7;
    grid.classList.toggle('compact',dw<(small?lanesAll():maxDayTotal(group))*36);
  });
}
const GUT=52; // ancho de la columna de horas (fija a la izquierda)
const curDayW=()=>(grid.getBoundingClientRect().width-GUT)/7;
// Cambia el zoom a `newW` px por día manteniendo bajo los dedos (x = cx) el mismo punto de la semana.
function zoomAt(newW,cx){
  const left=sc.getBoundingClientRect().left,w0=curDayW();
  const anchor=(sc.scrollLeft+cx-left-GUT)/w0;
  const zmax=Math.max(ZMAX,lanesAll()*MIN_LANE);
  zoom(newW<=(sc.clientWidth-GUT)/7*1.02?0:Math.min(newW,zmax));
  sc.scrollLeft=Math.max(0,anchor*curDayW()+GUT-(cx-left));
}
let pz=null;
const tdist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
const PINCH_GAIN=1.5; // >1: el zoom responde más que la separación de los dedos (un pinch normal ya se nota)
function startPinch(e){
  dispatchEvent(new PointerEvent('pointercancel')); // corta un arrastre de turno que estuviera en curso
  pz={d0:tdist(e.touches)||1,w0:curDayW()};
  sc.style.overflow='hidden'; // durante el pinch el scroll lo controla el zoom, no el navegador
}
sc.addEventListener('touchstart',e=>{if(e.touches.length===2)startPinch(e)},{passive:true});
sc.addEventListener('touchmove',e=>{
  if(e.touches.length!==2)return;
  if(!pz)startPinch(e); // por si el navegador ya había empezado a desplazar cuando entró el segundo dedo
  if(e.cancelable)e.preventDefault();
  zoomAt(pz.w0*Math.pow(tdist(e.touches)/pz.d0,PINCH_GAIN),(e.touches[0].clientX+e.touches[1].clientX)/2);
},{passive:false});
const endPinch=e=>{if(pz&&e.touches.length<2){pz=null;sc.style.overflow=''}};
sc.addEventListener('touchend',endPinch);sc.addEventListener('touchcancel',endPinch);
sc.addEventListener('gesturestart',e=>e.preventDefault()); // Safari: que no haga zoom a toda la página
sc.addEventListener('wheel',e=>{ // pellizco del trackpad / Ctrl+rueda en computador
  if(!e.ctrlKey)return;
  e.preventDefault();
  zoomAt(curDayW()*Math.exp(-e.deltaY*0.006),e.clientX);
},{passive:false});
addEventListener('resize',()=>zoom());
addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){pull();if(mode==='real')loadReal()}});
buildPalette();render();renderRests();zoom(0);pull();