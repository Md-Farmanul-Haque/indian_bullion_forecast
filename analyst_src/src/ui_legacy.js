(function(){
const V=n=>getComputedStyle(document.documentElement).getPropertyValue('--'+n).trim();
const DATA=window.LEGACY_DATA_FROM_SSOT(window.SSOT_DB);
const C=i=>getComputedStyle(document.documentElement).getPropertyValue('--c'+i).trim();
const nf=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}), n0=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
const num=v=>v==null||isNaN(v)?'—':nf.format(v), rs=v=>v==null?'—':'Rs '+nf.format(v);
const sgn=(v,d=1)=>v==null||isNaN(v)?'—':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(d);
const pct=(v,d=1)=>v==null||isNaN(v)?'—':sgn(v,d)+'%';
const tickRs=v=>v>=1e5?nf.format(v/1e5)+' lakh':n0.format(v);
const fyOf=s=>s+'-'+String((s+1)%100).padStart(2,'0');

// ---------- derived annual table
const A=DATA.rbi_annual.slice().sort((a,b)=>a.fy_start-b.fy_start);
const FX=new Map(DATA.inr_usd.map(r=>[r.fy,r])), MAC=new Map(DATA.macro.map(r=>[r.fy,r]));
const DEC=new Map(DATA.decomposition.map(r=>[r.fy,r])), DUTY=new Map(DATA.duty_equiv.map(r=>[r.fy,r]));
const ROWS=A.map((r,i)=>{const p=A[i-1],ch=(a,b)=>b?(a/b-1)*100:null;return{fy:r.fy,s:r.fy_start,gold:r.gold_rs_10g,silver:r.silver_rs_kg,
 gold_yoy:p?ch(r.gold_rs_10g,p.gold_rs_10g):null,silver_yoy:p?ch(r.silver_rs_kg,p.silver_rs_kg):null,
 ratio:r.gold_rs_10g*100/r.silver_rs_kg,intl_ratio:r.london_gold_rs_10g*100/r.ny_silver_rs_kg,
 gold_prem:ch(r.gold_rs_10g,r.london_gold_rs_10g),silver_prem:ch(r.silver_rs_kg,r.ny_silver_rs_kg),
 london_usd:r.london_gold_usd_oz,ny_cents:r.ny_silver_cents_oz,london_rs:r.london_gold_rs_10g,ny_rs:r.ny_silver_rs_kg,
 world_gold_yoy:p?ch(r.london_gold_usd_oz,p.london_gold_usd_oz):null,world_silver_yoy:p?ch(r.ny_silver_cents_oz,p.ny_silver_cents_oz):null,
 inr:(FX.get(r.fy)||{}).inr_per_usd??null,wpi:(MAC.get(r.fy)||{}).wpi??null,cpi:(MAC.get(r.fy)||{}).cpi_iw??null,
 gold_duty:(DUTY.get(r.fy)||{}).gold_duty_pct??null,silver_duty:(DUTY.get(r.fy)||{}).silver_duty_pct??null,table:r.rbi_table,url:r.source_url}});
const BY=new Map(ROWS.map(r=>[r.s,r]));
const MINS=ROWS[0].s, MAXS=ROWS[ROWS.length-1].s;
const EV=DATA.events;

// ---------- state
const S={metal:'gold',from:1946,to:MAXS,evt:'both',scale:'log',sel:MAXS,page:'live'};
const M=()=>S.metal, MC=()=>C(S.metal==='gold'?0:1), UNIT=()=>S.metal==='gold'?'per 10 g':'per kg';
const inRange=s=>s>=Math.max(S.from,MINS)&&s<=S.to;
const evOk=e=>S.evt==='both'||(S.evt==='geo')===e.type.startsWith('Geo');
const evBy=()=>{const m=new Map();EV.filter(evOk).forEach(e=>{if(!m.has(e.fy))m.set(e.fy,[]);m.get(e.fy).push(e)});return m};

// ---------- tooltip
const tip=document.getElementById('tip');
function showTip(ev,lines){tip.replaceChildren();lines.forEach((l,i)=>{const o=typeof l==='string'?{t:l}:l;const d=document.createElement('div');d.className=i===0?'h':(o.c||'');d.textContent=o.t;tip.appendChild(d)});
 tip.style.opacity=1;const w=tip.offsetWidth,h=tip.offsetHeight;let x=ev.clientX+14,y=ev.clientY-h/2;if(x+w>innerWidth-6)x=ev.clientX-w-14;y=Math.max(6,Math.min(innerHeight-h-6,y));tip.style.left=Math.max(6,x)+'px';tip.style.top=y+'px'}
function hideTip(){tip.style.opacity=0}
document.addEventListener('scroll',hideTip,true);

// ---------- chart frame
function frame(id,H,yLabels,mb=28){const el=document.getElementById(id);el.replaceChildren();const W=Math.max(280,el.clientWidth);
 const svg=d3.select(el).append('svg').attr('width',W).attr('height',H).attr('role','img');
 const t=svg.append('text').attr('class','tk');let lw=0;yLabels.forEach(s=>{t.text(s);lw=Math.max(lw,t.node().getComputedTextLength()||String(s).length*6.5)});t.remove();
 const m={l:Math.ceil(lw)+12,r:12,t:14,b:mb};return{el,svg,W,H,m,iw:W-m.l-m.r,ih:H-m.t-m.b,g:svg.append('g').attr('transform',`translate(${m.l},${m.t})`)}}
function yAxis(F,y,ticks,fmt){F.g.append('g').attr('class','gridl').call(d3.axisLeft(y).tickValues(ticks).tickSize(-F.iw).tickFormat(''));
 F.g.append('g').call(d3.axisLeft(y).tickValues(ticks).tickFormat(fmt).tickSize(0).tickPadding(7)).call(a=>a.select('.domain').remove())}
function xYears(F,x,y0,a,b){const span=b-a,step=F.W<520?(span>40?20:span>15?10:5):(span>40?10:span>15?5:span>6?2:1);
 const t=d3.range(Math.ceil(a/step)*step,b+1,step);F.g.append('g').attr('transform',`translate(0,${y0})`).call(d3.axisBottom(x).tickValues(t).tickFormat(d3.format('d')).tickSizeOuter(0))}
function selLine(F,x,s,h){if(s==null)return;F.g.append('rect').attr('x',x(s+0.25)).attr('width',Math.max(2,x(s+1.25)-x(s+0.25))).attr('y',0).attr('height',h).attr('fill',V('selfill')).attr('opacity',.6).lower()}
function overlay(F,x,h,lo,hi,tipFn){F.g.append('rect').attr('width',F.iw).attr('height',h).attr('fill','transparent').style('cursor','pointer')
 .on('mousemove',ev=>{const s=Math.max(lo,Math.min(hi,Math.floor(x.invert(d3.pointer(ev)[0])-0.25)));showTip(ev,tipFn(s))}).on('mouseleave',hideTip)
 .on('click',ev=>{const s=Math.max(lo,Math.min(hi,Math.floor(x.invert(d3.pointer(ev)[0])-0.25)));select(s)})}
function evLines(m,fy){return(m.get(fy)||[]).map(e=>({t:(e.type.startsWith('Geo')?'Global: ':'India: ')+e.text,c:'e'}))}

// ---------- charts
function cPrice(){const k=M(),c=MC(),evm=evBy();const lo=S.from<MINS?1946:S.from,hi=S.to;
 const ann=ROWS.filter(r=>inRange(r.s)).map(r=>({s:r.s,x:r.s+0.75,v:r[k],fy:r.fy}));
 const pts=S.from<MINS?DATA.pre1970_points.filter(p=>p.metal===k):[];
 const vals=ann.map(d=>d.v).concat(pts.map(p=>p.value));if(!vals.length)return;
 const log=S.scale==='log';const y=log?d3.scaleLog().domain([d3.min(vals)/1.5,d3.max(vals)*1.3]):d3.scaleLinear().domain([0,d3.max(vals)*1.1]);
 let yt=log?[50,100,200,500,1e3,2e3,5e3,1e4,2e4,5e4,1e5,2e5,5e5].filter(v=>v>=y.domain()[0]&&v<=y.domain()[1]):y.ticks(5);
 const F=frame('c-price',380,yt.map(tickRs).concat(['Global']),64);y.range([F.ih,0]);
 const x=d3.scaleLinear().domain([lo,hi+1.25]).range([0,F.iw]);
 if(lo<MINS){F.g.append('rect').attr('width',x(MINS+0.25)).attr('height',F.ih).attr('fill',V('gapfill'));F.g.append('text').attr('class','labm').attr('x',6).attr('y',14).text('No RBI annual series read before 1970-71')}
 selLine(F,x,S.sel,F.ih);yAxis(F,y,yt,tickRs);xYears(F,x,F.ih,lo,hi+1);
 F.g.append('path').datum(ann).attr('fill','none').attr('stroke',c).attr('stroke-width',2.2).attr('d',d3.line().x(d=>x(d.x)).y(d=>y(d.v)));
 F.g.selectAll('.pt').data(pts).join('circle').attr('cx',d=>x(d.x)).attr('cy',d=>y(d.value)).attr('r',4).attr('fill',V('panel')).attr('stroke',c).attr('stroke-width',2);
 const sr=ann.find(d=>d.s===S.sel);if(sr){F.g.append('circle').attr('cx',x(sr.x)).attr('cy',y(sr.v)).attr('r',5.5).attr('fill',getComputedStyle(document.documentElement).getPropertyValue('--hi')).attr('stroke',V('panel')).attr('stroke-width',2)}
 const L=ann[ann.length-1];if(L)F.g.append('text').attr('class','lab').attr('x',x(L.x)-6).attr('y',y(L.v)-9).attr('text-anchor','end').text(`${L.fy}: ${rs(L.v)}`);
 const rowY={geo:F.ih+32,dom:F.ih+48};F.g.append('text').attr('class','labm').attr('x',-8).attr('y',rowY.geo+4).attr('text-anchor','end').text('Global');F.g.append('text').attr('class','labm').attr('x',-8).attr('y',rowY.dom+4).attr('text-anchor','end').text('India');
 evm.forEach((l,fy)=>{const s=+fy.slice(0,4);if(s<lo||s>hi)return;new Set(l.map(e=>e.type.startsWith('Geo')?'geo':'dom')).forEach(t=>F.g.append('rect').attr('x',x(s+0.75)-1.5).attr('width',3).attr('y',rowY[t]-6).attr('height',12).attr('fill',C(t==='geo'?5:6)))});
 overlay(F,x,F.ih+56,lo,hi,s=>{const r=BY.get(s),fy=fyOf(s),L=[fy+' (April–March)'];
  if(r){L.push(`RBI annual average: ${rs(r[k])} ${UNIT()}`);if(r[k+'_yoy']!=null)L.push({t:pct(r[k+'_yoy'])+' on the year before',c:'m'})}else L.push({t:'No RBI annual average for this year',c:'m'});
  pts.filter(p=>p.x>=s+0.25&&p.x<s+1.25).forEach(p=>L.push({t:`${p.date}: ${rs(p.value)} ${UNIT()} (${p.original}). ${p.basis}. ${p.source}${p.host.startsWith('RBI report read')?', non-government mirror':''}.`,c:'m'}));
  return L.concat(evLines(evm,fy))})}

function cYoy(){const k=M()+'_yoy',evm=evBy();const rows=ROWS.filter(r=>inRange(r.s)&&r[k]!=null);if(!rows.length)return emptyMsg('c-yoy');
 const y=d3.scaleLinear().domain([Math.min(0,d3.min(rows,r=>r[k])*1.25),d3.max(rows,r=>r[k])*1.1]).nice();const yt=y.ticks(5);
 const F=frame('c-yoy',290,yt.map(v=>sgn(v,0)+'%'));y.range([F.ih,0]);
 const x=d3.scaleBand().domain(rows.map(r=>r.s)).range([0,F.iw]).paddingInner(.18);yAxis(F,y,yt,v=>sgn(v,0)+'%');
 const step=rows.length>40?10:rows.length>15?5:2;F.g.append('g').attr('transform',`translate(0,${F.ih})`).call(d3.axisBottom(x).tickValues(rows.filter(r=>r.s%step===0).map(r=>r.s)).tickFormat(s=>fyOf(s)).tickSizeOuter(0));
 F.g.selectAll('.b').data(rows).join('rect').attr('x',r=>x(r.s)).attr('width',x.bandwidth()).attr('y',r=>Math.min(y(r[k]),y(0))).attr('height',r=>Math.max(1,Math.abs(y(r[k])-y(0))))
  .attr('fill',r=>r.s===S.sel?getComputedStyle(document.documentElement).getPropertyValue('--hi'):MC()).attr('rx',1.5).style('cursor','pointer')
  .on('mousemove',(ev,r)=>showTip(ev,[r.fy,pct(r[k])+' on the year before',...evLines(evm,r.fy)])).on('mouseleave',hideTip).on('click',(ev,r)=>select(r.s));
 F.g.append('line').attr('x1',0).attr('x2',F.iw).attr('y1',y(0)).attr('y2',y(0)).attr('stroke',V('zero'));
 const hiR=rows.reduce((a,b)=>b[k]>a[k]?b:a),loR=rows.reduce((a,b)=>b[k]<a[k]?b:a);
 [hiR,loR].forEach(r=>F.g.append('text').attr('class','lab').attr('x',Math.max(30,Math.min(F.iw-30,x(r.s)+x.bandwidth()/2))).attr('y',r[k]>=0?y(r[k])-5:y(r[k])+13).attr('text-anchor','middle').text(`${r.fy}: ${pct(r[k])}`))}

function emptyMsg(id,t){const el=document.getElementById(id);el.replaceChildren();const p=document.createElement('p');p.className='d';p.style.color='var(--muted)';p.textContent=t||'No data in the selected years.';el.appendChild(p)}

function cMini(){const r=BY.get(S.sel),d=DEC.get(fyOf(S.sel));document.getElementById('t-yeardetail').textContent='Selected year: '+fyOf(S.sel);
 const box=document.getElementById('yearEvents');box.replaceChildren();
 const evs=EV.filter(e=>e.fy===fyOf(S.sel)&&evOk(e));if(!evs.length){const q=document.createElement('div');q.textContent='No sourced event recorded for this year'+(S.evt!=='both'?' under this filter.':'.');q.style.color='var(--muted)';box.appendChild(q)}
 evs.forEach(e=>{const q=document.createElement('div');const b=document.createElement('span');b.className='pill'+(e.type.startsWith('Geo')?'':' dom');b.textContent=e.type.startsWith('Geo')?'Global':'India';q.appendChild(b);q.appendChild(document.createTextNode(e.text));box.appendChild(q)});
 if(!d)return emptyMsg('c-mini',r?'No split available for the first year of the series.':'No RBI annual data for this year.');
 const k=M(),parts=[['World price in US$',d[k+'_world'],2],['Rupee vs US$',d[k+'_rupee'],3],["India's premium",d[k+'_premium'],4],['Total change',d[k+'_total'],null]];
 const F=frame('c-mini',150,["India's premium","World price in US$"]);F.g.attr('transform',`translate(${F.m.l+4},6)`);
 const ext=d3.max(parts,p=>Math.abs(p[1]))*1.25||1;const x=d3.scaleLinear().domain([-ext,ext]).range([0,F.iw-50]);const yb=d3.scaleBand().domain(parts.map(p=>p[0])).range([0,130]).padding(.25);
 F.g.append('line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',0).attr('y2',130).attr('stroke',V('zero'));
 parts.forEach(p=>{F.g.append('text').attr('class','labm').attr('x',-6).attr('y',yb(p[0])+yb.bandwidth()/2+4).attr('text-anchor','end').text(p[0]);
  F.g.append('rect').attr('x',Math.min(x(0),x(p[1]))).attr('width',Math.abs(x(p[1])-x(0))).attr('y',yb(p[0])).attr('height',yb.bandwidth()).attr('rx',2).attr('fill',p[2]==null?V('ink'):C(p[2]));
  F.g.append('text').attr('class','lab').attr('x',p[1]>=0?x(p[1])+5:x(p[1])-5).attr('text-anchor',p[1]>=0?'start':'end').attr('y',yb(p[0])+yb.bandwidth()/2+4).text(sgn(p[1]))})}

function cDecomp(){const k=M();const rows=DATA.decomposition.filter(r=>inRange(r.fy_start)).sort((a,b)=>a.fy_start-b.fy_start);if(!rows.length)return emptyMsg('c-decomp');
 const comps=[[k+'_world','World price in US$',2],[k+'_rupee','Rupee vs US$',3],[k+'_premium',"India's premium",4]];const segs=[];let lo=0,hi=0;
 rows.forEach(r=>{let p=0,n=0;comps.forEach(c=>{const v=r[c[0]];if(v>=0){segs.push({s:r.fy_start,ci:c[2],y0:p,y1:p+v});p+=v}else{segs.push({s:r.fy_start,ci:c[2],y0:n+v,y1:n});n+=v}});lo=Math.min(lo,n,r[k+'_total']);hi=Math.max(hi,p,r[k+'_total'])});
 const y=d3.scaleLinear().domain([lo,hi]).nice();const yt=y.ticks(6);const F=frame('c-decomp',340,yt.map(v=>sgn(v,0)));y.range([F.ih,0]);
 const x=d3.scaleBand().domain(rows.map(r=>r.fy_start)).range([0,F.iw]).paddingInner(.16);yAxis(F,y,yt,v=>sgn(v,0));
 const step=rows.length>40?10:rows.length>15?5:2;F.g.append('g').attr('transform',`translate(0,${F.ih})`).call(d3.axisBottom(x).tickValues(rows.filter(r=>r.fy_start%step===0).map(r=>r.fy_start)).tickFormat(fyOf).tickSizeOuter(0));
 if(x(S.sel)!=null)F.g.append('rect').attr('x',x(S.sel)-x.step()*.08).attr('width',x.step()).attr('height',F.ih).attr('fill',V('selfill'));
 F.g.selectAll('.sg').data(segs).join('rect').attr('x',s=>x(s.s)).attr('width',x.bandwidth()).attr('y',s=>y(s.y1)).attr('height',s=>Math.max(.5,y(s.y0)-y(s.y1))).attr('fill',s=>C(s.ci)).attr('stroke',V('panel')).attr('stroke-width',.6);
 F.g.append('line').attr('x1',0).attr('x2',F.iw).attr('y1',y(0)).attr('y2',y(0)).attr('stroke',V('zero'));
 F.g.selectAll('.tt').data(rows).join('line').attr('x1',r=>x(r.fy_start)-1).attr('x2',r=>x(r.fy_start)+x.bandwidth()+1).attr('y1',r=>y(r[k+'_total'])).attr('y2',r=>y(r[k+'_total'])).attr('stroke',V('ink')).attr('stroke-width',2);
 F.g.selectAll('.hit').data(rows).join('rect').attr('x',r=>x(r.fy_start)).attr('width',x.step()).attr('height',F.ih).attr('fill','transparent').style('cursor','pointer')
  .on('mousemove',(ev,r)=>showTip(ev,[r.fy,`Total: ${sgn(r[k+'_total'])} log-points`,...comps.map(c=>({t:`${c[1]}: ${sgn(r[c[0]])}`,c:'m'}))])).on('mouseleave',hideTip).on('click',(ev,r)=>select(r.fy_start))}

function cContrib(){const k=M();const rows=DATA.decomposition.filter(r=>inRange(r.fy_start));if(!rows.length)return emptyMsg('c-contrib');
 const sum=f=>d3.sum(rows,r=>r[k+f]);const tot=sum('_total');const parts=[['World price in US$',sum('_world'),2],['Rupee vs US$',sum('_rupee'),3],["India's premium",sum('_premium'),4],['Total',tot,null]];
 const F=frame('c-contrib',170,parts.map(p=>p[0]).concat(["India's premium"]));const ext=d3.max(parts,p=>Math.abs(p[1]))*1.35||1;
 const x=d3.scaleLinear().domain([Math.min(0,d3.min(parts,p=>p[1]))*1.35,ext]).range([0,F.iw-10]);const yb=d3.scaleBand().domain(parts.map(p=>p[0])).range([0,F.ih]).padding(.25);
 F.g.append('line').attr('x1',x(0)).attr('x2',x(0)).attr('y1',0).attr('y2',F.ih).attr('stroke',V('zero'));
 parts.forEach(p=>{F.g.append('text').attr('class','labm').attr('x',-6).attr('y',yb(p[0])+yb.bandwidth()/2+4).attr('text-anchor','end').text(p[0]);
  F.g.append('rect').attr('x',Math.min(x(0),x(p[1]))).attr('width',Math.abs(x(p[1])-x(0))).attr('y',yb(p[0])).attr('height',yb.bandwidth()).attr('rx',2).attr('fill',p[2]==null?V('ink'):C(p[2]));
  const sh=p[2]!=null&&tot?` (${Math.round(p[1]/tot*100)}%)`:'';F.g.append('text').attr('class','lab').attr('x',p[1]>=0?x(p[1])+5:x(0)+5).attr('text-anchor','start').attr('y',yb(p[0])+yb.bandwidth()/2+4).text(sgn(p[1])+sh)});
 const a=rows[0],b=rows[rows.length-1];F.svg.append('text').attr('class','labm').attr('x',F.W-6).attr('y',F.H-4).attr('text-anchor','end').text(`Sum of yearly log-point changes, ${fyOf(a.fy_start-1)} → ${b.fy}`)}

function cWpi(){const k=M()+'_yoy';const rows=ROWS.filter(r=>inRange(r.s)&&r[k]!=null&&r.wpi!=null);if(!rows.length)return emptyMsg('c-wpi');
 const all=rows.flatMap(r=>[r[k],r.wpi]);const y=d3.scaleLinear().domain([Math.min(0,d3.min(all)),d3.max(all)]).nice();const yt=y.ticks(5);
 const F=frame('c-wpi',260,yt.map(v=>v+'%'));y.range([F.ih,0]);const x=d3.scaleBand().domain(rows.map(r=>r.s)).range([0,F.iw]).paddingInner(.1);const x2=d3.scaleBand().domain([0,1]).range([0,x.bandwidth()]);
 yAxis(F,y,yt,v=>v+'%');const step=rows.length>40?10:rows.length>15?5:2;F.g.append('g').attr('transform',`translate(0,${F.ih})`).call(d3.axisBottom(x).tickValues(rows.filter(r=>r.s%step===0).map(r=>r.s)).tickFormat(fyOf).tickSizeOuter(0));
 rows.forEach(r=>{[[r[k],MC()],[r.wpi,C(7)]].forEach(([v,c],i)=>F.g.append('rect').attr('x',x(r.s)+x2(i)).attr('width',x2.bandwidth()).attr('y',Math.min(y(v),y(0))).attr('height',Math.max(.5,Math.abs(y(v)-y(0)))).attr('fill',c))});
 F.g.append('line').attr('x1',0).attr('x2',F.iw).attr('y1',y(0)).attr('y2',y(0)).attr('stroke',V('zero'));
 F.g.selectAll('.hit').data(rows).join('rect').attr('x',r=>x(r.s)).attr('width',x.step()).attr('height',F.ih).attr('fill','transparent')
  .on('mousemove',(ev,r)=>showTip(ev,[r.fy,`${M()==='gold'?'Gold':'Silver'}: ${pct(r[k])}`,{t:`WPI inflation: ${pct(r.wpi)}`,c:'m'}])).on('mouseleave',hideTip).on('click',(ev,r)=>select(r.s))}

function cPrem(){const k=M(),c=MC();const rows=ROWS.filter(r=>inRange(r.s));if(!rows.length)return emptyMsg('c-prem');const du=rows.filter(r=>r[k+'_duty']!=null);
 const all=rows.map(r=>r[k+'_prem']).concat(du.map(r=>r[k+'_duty']));const y=d3.scaleLinear().domain([Math.min(0,d3.min(all)),d3.max(all)]).nice();const yt=y.ticks(6);
 const F=frame('c-prem',360,yt.map(v=>v+'%'));y.range([F.ih,0]);const lo=rows[0].s,hi=rows[rows.length-1].s;const x=d3.scaleLinear().domain([lo,hi+1]).range([0,F.iw]);
 selLine(F,x,S.sel,F.ih);yAxis(F,y,yt,v=>v+'%');xYears(F,x,F.ih,lo,hi+1);F.g.append('line').attr('x1',0).attr('x2',F.iw).attr('y1',y(0)).attr('y2',y(0)).attr('stroke',V('zero'));
 const ln=f=>d3.line().defined(r=>r[f]!=null).x(r=>x(r.s+.75)).y(r=>y(r[f]));
 F.g.append('path').datum(rows).attr('fill','none').attr('stroke',c).attr('stroke-width',2.2).attr('d',ln(k+'_prem'));
 F.g.append('path').datum(rows).attr('fill','none').attr('stroke',V('ink')).attr('stroke-width',2).attr('stroke-dasharray','5 4').attr('d',ln(k+'_duty'));
 overlay(F,x,F.ih,lo,hi,s=>{const r=BY.get(s);return[r.fy,`Domestic premium: ${pct(r[k+'_prem'],2)}`,{t:r[k+'_duty']!=null?`Import duty in force: ${r[k+'_duty'].toFixed(2)}% of value`:'Import duty: no confirmed figure, or imports not allowed',c:'m'}]})}

function cRatio(){const rows=ROWS.filter(r=>inRange(r.s));if(!rows.length)return emptyMsg('c-ratio');const y=d3.scaleLinear().domain([0,d3.max(rows,r=>Math.max(r.ratio,r.intl_ratio))]).nice();const yt=y.ticks(5);
 const F=frame('c-ratio',300,yt.map(String));y.range([F.ih,0]);const lo=rows[0].s,hi=rows[rows.length-1].s;const x=d3.scaleLinear().domain([lo,hi+1]).range([0,F.iw]);
 selLine(F,x,S.sel,F.ih);yAxis(F,y,yt,String);xYears(F,x,F.ih,lo,hi+1);
 [['ratio',7],['intl_ratio',2]].forEach(([f,ci])=>F.g.append('path').datum(rows).attr('fill','none').attr('stroke',C(ci)).attr('stroke-width',2.2).attr('d',d3.line().x(r=>x(r.s+.75)).y(r=>y(r[f]))));
 overlay(F,x,F.ih,lo,hi,s=>{const r=BY.get(s);return[r.fy,`India (Mumbai): ${num(r.ratio)}`,{t:`World (London ÷ New York): ${num(r.intl_ratio)}`,c:'m'}]})}

function cFx(){const lo=S.from<MINS?1946:S.from;const rows=DATA.inr_usd.filter(r=>r.fy_start>=lo&&r.fy_start<=S.to).sort((a,b)=>a.fy_start-b.fy_start);const ok=rows.filter(r=>r.inr_per_usd!=null);if(!ok.length)return emptyMsg('c-fx');
 const y=d3.scaleLinear().domain([0,d3.max(ok,r=>r.inr_per_usd)]).nice();const yt=y.ticks(5);const F=frame('c-fx',260,yt.map(String));y.range([F.ih,0]);
 const a=rows[0].fy_start,b=rows[rows.length-1].fy_start;const x=d3.scaleLinear().domain([a,b+1]).range([0,F.iw]);selLine(F,x,S.sel,F.ih);yAxis(F,y,yt,String);xYears(F,x,F.ih,a,b+1);
 F.g.append('path').datum(rows).attr('fill','none').attr('stroke',C(3)).attr('stroke-width',2.2).attr('d',d3.line().defined(r=>r.inr_per_usd!=null).x(r=>x(r.fy_start+.75)).y(r=>y(r.inr_per_usd)));
 F.g.selectAll('.d').data(ok).join('circle').attr('cx',r=>x(r.fy_start+.75)).attr('cy',r=>y(r.inr_per_usd)).attr('r',2).attr('fill',C(3));
 const L=ok[ok.length-1];F.g.append('text').attr('class','lab').attr('x',x(L.fy_start+.75)-4).attr('y',y(L.inr_per_usd)-8).attr('text-anchor','end').text(`${L.fy}: Rs ${num(L.inr_per_usd)}`);
 const m=new Map(rows.map(r=>[r.fy_start,r]));overlay(F,x,F.ih,a,b,s=>{const r=m.get(s);return r?[r.fy,r.inr_per_usd==null?'No government figure found':`Rs ${num(r.inr_per_usd)} per US$`,{t:r.basis,c:'m'}]:[fyOf(s)]})}

function cMonthly(){const pm=s=>{const[a,b]=s.split('-').map(Number);return new Date(Date.UTC(a,b-1,15))};const rows=DATA.monthly.map(r=>({...r,d:pm(r.month)})).sort((a,b)=>a.d-b.d);
 const sg=DATA.sgb.map(r=>{const[a,b,c]=r.date.split('-').map(Number);return{...r,d:new Date(Date.UTC(a,b-1,c)),v:r.rs_per_gram*10}});
 const start=new Date(Date.UTC(2025,0,1)),end=new Date(Date.UTC(2026,11,1));const sgr=sg.filter(s=>s.d>=start);const lastPub=new Date(Date.UTC(rows[rows.length-1].d.getUTCFullYear(),rows[rows.length-1].d.getUTCMonth()+1,1));
 const PH=170,gap=52;const yG=d3.scaleLinear().domain([d3.min(rows.map(r=>r.gold_rs_10g).concat(sgr.map(s=>s.v)))*.92,d3.max(rows.map(r=>r.gold_rs_10g).concat(sgr.map(s=>s.v)))*1.06]).nice();
 const yS=d3.scaleLinear().domain([d3.min(rows,r=>r.silver_rs_kg)*.9,d3.max(rows,r=>r.silver_rs_kg)*1.08]).nice();
 const F=frame('c-monthly',PH*2+gap+44,yG.ticks(4).concat(yS.ticks(4)).map(tickRs));const x=d3.scaleUtc().domain([start,end]).range([0,F.iw]);
 [[ 'gold_rs_10g',yG,0,0,'Gold, Rs per 10 g'],['silver_rs_kg',yS,1,PH+gap,'Silver, Rs per kg']].forEach(([f,y,ci,top,name])=>{y.range([PH,0]);const g=F.g.append('g').attr('transform',`translate(0,${top})`);
  g.append('rect').attr('x',x(lastPub)).attr('width',x(end)-x(lastPub)).attr('height',PH).attr('fill',V('gapfill'));g.append('text').attr('class','labm').attr('x',x(end)-4).attr('y',14).attr('text-anchor','end').text('Not yet published');
  g.append('text').attr('class','labm').attr('y',-4).text(name);
  g.append('g').attr('class','gridl').call(d3.axisLeft(y).ticks(4).tickSize(-F.iw).tickFormat(''));g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(tickRs).tickSize(0).tickPadding(7)).call(a=>a.select('.domain').remove());
  g.append('g').attr('transform',`translate(0,${PH})`).call(d3.axisBottom(x).ticks(d3.utcMonth.every(F.W<520?6:3)).tickFormat(d3.utcFormat('%b %Y')).tickSizeOuter(0));
  g.append('path').datum(rows).attr('fill','none').attr('stroke',C(ci)).attr('stroke-width',2.2).attr('d',d3.line().x(r=>x(r.d)).y(r=>y(r[f])));
  g.selectAll('.p').data(rows).join('circle').attr('cx',r=>x(r.d)).attr('cy',r=>y(r[f])).attr('r',2.6).attr('fill',C(ci));
  if(ci===0)g.selectAll('.s').data(sgr).join('circle').attr('cx',s=>x(s.d)).attr('cy',s=>y(s.v)).attr('r',4).attr('fill','none').attr('stroke',V('ink')).attr('stroke-width',1.5);
  const pk=rows.reduce((a,b)=>b[f]>a[f]?b:a);g.append('text').attr('class','lab').attr('x',Math.max(50,Math.min(F.iw-50,x(pk.d)))).attr('y',y(pk[f])-8).attr('text-anchor','middle').text(`${d3.utcFormat('%b %Y')(pk.d)}: ${rs(pk[f])}`)});
 F.g.append('rect').attr('width',F.iw).attr('height',PH*2+gap).attr('fill','transparent').on('mousemove',ev=>{const t=x.invert(d3.pointer(ev)[0]);const r=rows.reduce((a,b)=>Math.abs(b.d-t)<Math.abs(a.d-t)?b:a);
  const L=[d3.utcFormat('%B %Y')(r.d),`Gold: ${rs(r.gold_rs_10g)} per 10 g`,`Silver: ${rs(r.silver_rs_kg)} per kg`,{t:r.source,c:'m'}];
  sg.filter(s=>s.d.getUTCFullYear()===r.d.getUTCFullYear()&&s.d.getUTCMonth()===r.d.getUTCMonth()).forEach(s=>L.push({t:`SGB price ${s.label}: ${rs(s.v)} per 10 g (999 gold)`,c:'e'}));showTip(ev,L)}).on('mouseleave',hideTip)}

function cScatter(){const k=M();const rows=ROWS.filter(r=>inRange(r.s)&&r[k+'_yoy']!=null);if(!rows.length)return emptyMsg('c-scatter');const wx=k==='gold'?'world_gold_yoy':'world_silver_yoy';
 const ex=d3.extent(rows.flatMap(r=>[r[k+'_yoy'],r[wx]]));const pad=(ex[1]-ex[0])*.06;const x=d3.scaleLinear().domain([ex[0]-pad,ex[1]+pad]).nice(),y=x.copy();const yt=y.ticks(5);
 const F=frame('c-scatter',340,yt.map(v=>v+'%'),34);x.range([0,F.iw]);y.range([F.ih,0]);yAxis(F,y,yt,v=>v+'%');F.g.append('g').attr('transform',`translate(0,${F.ih})`).call(d3.axisBottom(x).ticks(5).tickFormat(v=>v+'%'));
 F.g.append('line').attr('x1',x(Math.max(x.domain()[0],y.domain()[0]))).attr('y1',y(Math.max(x.domain()[0],y.domain()[0]))).attr('x2',x(Math.min(x.domain()[1],y.domain()[1]))).attr('y2',y(Math.min(x.domain()[1],y.domain()[1]))).attr('stroke',V('zero')).attr('stroke-dasharray','3 3');
 F.svg.append('text').attr('class','labm').attr('x',F.m.l+F.iw).attr('y',F.H-2).attr('text-anchor','end').text(k==='gold'?'World gold (London, US$) yearly change':'World silver (New York, US$) yearly change');
 F.g.selectAll('.c').data(rows).join('circle').attr('cx',r=>x(r[wx])).attr('cy',r=>y(r[k+'_yoy'])).attr('r',r=>r.s===S.sel?7:4.5).attr('fill',r=>C(r.s<1990?6:2)).attr('fill-opacity',.8).attr('stroke',r=>r.s===S.sel?V('ink'):V('panel')).attr('stroke-width',r=>r.s===S.sel?2:1).style('cursor','pointer')
  .on('mousemove',(ev,r)=>showTip(ev,[r.fy,`India: ${pct(r[k+'_yoy'])}`,{t:`World US$: ${pct(r[wx])}`,c:'m'}])).on('mouseleave',hideTip).on('click',(ev,r)=>select(r.s));
 const pr=(a,b)=>{const n=a.length,ma=d3.mean(a),mb=d3.mean(b);let s=0,sa=0,sb=0;for(let i=0;i<n;i++){s+=(a[i]-ma)*(b[i]-mb);sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2}return s/Math.sqrt(sa*sb)};
 const r=rows.length>2?pr(rows.map(r=>r[wx]),rows.map(r=>r[k+'_yoy'])):null;F.g.append('text').attr('class','lab').attr('x',6).attr('y',12).text(r==null?'':`r = ${r.toFixed(2)} over ${rows.length} years in the selection`)}

// ---------- tables
function tbl(id,cols,rows,opt={}){const t=document.getElementById(id);t.replaceChildren();const th=t.createTHead().insertRow();
 cols.forEach((c,i)=>{const h=document.createElement('th');h.textContent=c.h+(opt.sortKey===i?(opt.asc?' ▲':' ▼'):'');if(c.n)h.className='n';if(opt.onSort)h.onclick=()=>opt.onSort(i);th.appendChild(h)});
 const tb=t.createTBody();rows.forEach(r=>{const tr=tb.insertRow();if(opt.sel&&opt.sel(r))tr.className='sel';if(opt.click)tr.onclick=()=>opt.click(r);
  cols.forEach(c=>{const td=tr.insertCell();if(c.n)td.className='n';const v=c.f(r);if(v instanceof Node)td.appendChild(v);else td.textContent=v})})}
let corrState={};
function tCorr(){tbl('tb-corr',[{h:'Metal',f:r=>r.metal},{h:'Compared with',f:r=>r.driver},{h:'Period',f:r=>r.era},{h:'Years',n:1,f:r=>r.n},{h:'r',n:1,f:r=>(r.r>0?'+':'')+r.r.toFixed(2)},{h:'Significance',f:r=>r.significance}],
 DATA.correlations.filter(r=>r.metal.toLowerCase()===M()))}
function tEvents(){const q=(document.getElementById('evq').value||'').toLowerCase();const lo=S.from;
 const rows=EV.filter(e=>evOk(e)&&e.fy_start>=lo&&e.fy_start<=S.to&&(!q||e.text.toLowerCase().includes(q)||e.fy.includes(q))).sort((a,b)=>a.fy_start-b.fy_start||a.type.localeCompare(b.type));
 tbl('tb-events',[{h:'Year',f:r=>r.fy},{h:'Type',f:r=>{const s=document.createElement('span');s.className='pill'+(r.type.startsWith('Geo')?'':' dom');s.textContent=r.type.startsWith('Geo')?'Global':'India';return s}},{h:'What happened (with source label)',f:r=>r.text}],rows,{sel:r=>r.fy_start===S.sel,click:r=>select(r.fy_start)})}
function tDuty(){document.getElementById('t-duty').textContent='Import duty & trade rules — '+(M()==='gold'?'gold':'silver');
 tbl('tb-duty',[{h:'From',f:r=>r.effective},{h:'Duty or rule',f:r=>r.rate},{h:'Status',f:r=>r.status},{h:'Source',f:r=>{const s=document.createElement('span');String(r.source||'').split(/\s*;\s*/).filter(Boolean).forEach((u,i)=>{if(i)s.appendChild(document.createTextNode(' · '));if(/^https?:\/\//.test(u)){const a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener';try{a.textContent=new URL(u).hostname.replace(/^www\./,'')}catch(e){a.textContent=u}s.appendChild(a)}else s.appendChild(document.createTextNode(u))});return s}}],
 DATA.duty_history.filter(r=>r.metal.toLowerCase()===M()))}
const DCOLS=[{h:'Year',k:'fy',f:r=>r.fy},{h:'Gold Rs/10g',k:'gold',n:1,f:r=>num(r.gold)},{h:'Gold YoY',k:'gold_yoy',n:1,f:r=>pct(r.gold_yoy)},{h:'Silver Rs/kg',k:'silver',n:1,f:r=>num(r.silver)},{h:'Silver YoY',k:'silver_yoy',n:1,f:r=>pct(r.silver_yoy)},
 {h:'G/S ratio',k:'ratio',n:1,f:r=>r.ratio.toFixed(1)},{h:'Gold premium',k:'gold_prem',n:1,f:r=>pct(r.gold_prem)},{h:'Silver premium',k:'silver_prem',n:1,f:r=>pct(r.silver_prem)},{h:'Gold duty %',k:'gold_duty',n:1,f:r=>r.gold_duty==null?'':r.gold_duty.toFixed(2)},
 {h:'INR/USD',k:'inr',n:1,f:r=>r.inr==null?'':num(r.inr)},{h:'WPI %',k:'wpi',n:1,f:r=>r.wpi==null?'':r.wpi.toFixed(1)},{h:'London $/oz',k:'london_usd',n:1,f:r=>num(r.london_usd)},{h:'NY silver ¢/oz',k:'ny_cents',n:1,f:r=>num(r.ny_cents)},{h:'RBI table',k:'table',f:r=>r.table}];
let dSort={i:0,asc:false};
function tData(){const q=(document.getElementById('dq').value||'').trim();let rows=ROWS.filter(r=>inRange(r.s)&&(!q||r.fy.includes(q)));const c=DCOLS[dSort.i];
 rows.sort((a,b)=>{const x=a[c.k],y=b[c.k];if(x==null)return 1;if(y==null)return -1;return(x<y?-1:x>y?1:0)*(dSort.asc?1:-1)});
 tbl('tb-data',DCOLS,rows,{sortKey:dSort.i,asc:dSort.asc,onSort:i=>{dSort={i,asc:dSort.i===i?!dSort.asc:false};tData()},sel:r=>r.s===S.sel,click:r=>select(r.s)})}
document.getElementById('csv').onclick=()=>{const keys=['fy','gold','gold_yoy','silver','silver_yoy','ratio','intl_ratio','gold_prem','silver_prem','gold_duty','silver_duty','inr','wpi','london_usd','london_rs','ny_cents','ny_rs','table','url'];
 const lines=[keys.join(',')].concat(ROWS.filter(r=>inRange(r.s)).map(r=>keys.map(k=>{const v=r[k];if(v==null)return'';if(typeof v==='number')return+v.toFixed(4);return'"'+String(v).replace(/"/g,'""')+'"'}).join(',')));
 const b=new Blob([lines.join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='india_gold_silver_'+S.from+'_'+S.to+'.csv';document.body.appendChild(a);a.click();a.remove()};

// ---------- KPIs
function kpis(){const k=M(),r=BY.get(S.sel);const box=document.getElementById('kpis');box.replaceChildren();
 const card=(l,v,s,col,cls)=>{const d=document.createElement('div');d.className='kpi';d.style.borderTopColor=col;const a=document.createElement('div');a.className='l';a.textContent=l;const b=document.createElement('div');b.className='v'+(cls?' '+cls:'');b.textContent=v;const c=document.createElement('div');c.className='s';c.textContent=s;d.append(a,b,c);box.appendChild(d)};
 const a=ROWS.find(x=>x.s===Math.max(S.from,MINS)),z=ROWS.find(x=>x.s===S.to)||ROWS[ROWS.length-1];
 if(r){card((k==='gold'?'Gold':'Silver')+' · '+r.fy,rs(r[k]),UNIT()+' · RBI Mumbai average',MC());
  card('Change on year before',pct(r[k+'_yoy']),r.fy,V('muted'),r[k+'_yoy']>0?'up':r[k+'_yoy']<0?'down':'');
  card('Premium over world price',pct(r[k+'_prem']),'vs '+(k==='gold'?'London':'New York')+' in rupees',C(4));
  card('Gold–silver ratio',r.ratio.toFixed(1),'world: '+r.intl_ratio.toFixed(1),C(7));
  card('Rupees per US$',r.inr==null?'—':num(r.inr),r.inr==null?'no government figure':'annual average',C(3))}
 else card('Selected year '+fyOf(S.sel),'No RBI annual average','dated points only before 1970-71',V('muted'));
 if(a&&z&&z.s>a.s){const g=(Math.pow(z[k]/a[k],1/(z.s-a.s))-1)*100;card('Growth '+a.fy+' → '+z.fy,pct(g,2)+' a year',`×${num(z[k]/a[k])} overall`,C(2))}
 document.getElementById('selbar').innerHTML='';const sb=document.getElementById('selbar');sb.append('Selected year: ');const b=document.createElement('b');b.textContent=fyOf(S.sel);sb.append(b,' · click any year in a chart or table to change it · year range applies to every page.')}

// ---------- slicers & render
const fromSel=document.getElementById('from'),toSel=document.getElementById('to');
[1946].concat(d3.range(MINS,MAXS+1)).forEach(s=>fromSel.add(new Option(s===1946?'1946 (incl. dated points)':fyOf(s),s)));d3.range(MINS,MAXS+1).forEach(s=>toSel.add(new Option(fyOf(s),s)));
fromSel.onchange=()=>{S.from=+fromSel.value;if(S.to<Math.max(S.from,MINS))S.to=MAXS;fixSel();render()};toSel.onchange=()=>{S.to=+toSel.value;if(S.from>S.to)S.from=1946;fixSel();render()};
function fixSel(){if(S.sel>S.to||S.sel<Math.max(S.from,MINS))S.sel=S.to}
document.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{S[b.dataset.k]=b.dataset.v;render()});
document.querySelectorAll('[data-era]').forEach(b=>b.onclick=()=>{const e=b.dataset.era;if(e==='all'){S.from=1946;S.to=MAXS}else if(e==='ctl'){S.from=MINS;S.to=1989}else if(e==='lib'){S.from=1990;S.to=MAXS}else{S.from=MAXS-9;S.to=MAXS}fixSel();render()});
document.getElementById('reset').onclick=()=>{Object.assign(S,{metal:'gold',from:1946,to:MAXS,evt:'both',scale:'log',sel:MAXS});document.getElementById('evq').value='';document.getElementById('dq').value='';render()};
document.querySelectorAll('nav button[data-page]').forEach(b=>b.onclick=()=>{S.page=b.dataset.page;render();scrollTo({top:0})});
document.getElementById('evq').oninput=tEvents;document.getElementById('dq').oninput=tData;
function select(s){S.sel=s;render()}
const PAGES={overview:[cPrice,cYoy,cMini],drivers:[cDecomp,cContrib,cWpi],premium:[cPrem],ratio:[cRatio,cFx],monthly:[cMonthly],corr:[cScatter,tCorr],events:[tEvents],duty:[tDuty],data:[tData],notes:[]};
function render(){hideTip();
 document.querySelectorAll('[data-k]').forEach(b=>b.classList.toggle('on',S[b.dataset.k]===b.dataset.v));
 const era=S.from<=MINS&&S.to===MAXS?'all':S.from===MINS&&S.to===1989?'ctl':S.from===1990&&S.to===MAXS?'lib':S.from===MAXS-9&&S.to===MAXS?'10':'';
 document.querySelectorAll('[data-era]').forEach(b=>b.classList.toggle('on',b.dataset.era===era));
 fromSel.value=S.from<MINS?1946:S.from;toSel.value=S.to;
 document.querySelectorAll('nav button[data-page]').forEach(b=>b.classList.toggle('on',b.dataset.page===S.page));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('on',p.id==='p-'+S.page));
 document.querySelectorAll('.mcol').forEach(i=>i.style.background=MC());document.querySelectorAll('.mring').forEach(i=>i.style.borderColor=MC());
 document.getElementById('t-price').textContent=(M()==='gold'?'Gold':'Silver')+' price path, Rs '+UNIT();
 const legacy=!!PAGES[S.page];['slicers','kpis','selbar'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display=legacy?'':'none'});
 if(legacy)kpis();(PAGES[S.page]||(window.UIPAGES&&window.UIPAGES[S.page])||[]).forEach(f=>{try{f()}catch(e){console.error(f.name,e)}})}
window.LEGACY={render:()=>render(),S,go:p=>{S.page=p;render()}};
let rt;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(render,150)});
render();
})();
