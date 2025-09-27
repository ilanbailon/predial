// ====== Supabase ======
  const SUPABASE_URL = "https://wbzxbfqowlfmmkwqeyam.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndienhiZnFvd2xmbW1rd3FleWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODUwMDQsImV4cCI6MjA3MjU2MTAwNH0.mJJ7yID73tUerWE_aiNw3ZE4o-Q9YrT39YN-iS2CksA";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ====== Campos ======
  const ID_FIELD   = "id";
  const CODE_FIELD = "codigo_mtc";
  const PRELIM_FIELD = "codigo_preliminar";
  const SECTOR_FIELD = "comunidad";
  const RESP_FIELD = "responsable_tecnico";
  const DONE_FIELD = "fecha_elaboracion";
  const PLAN_FIELD = "fecha_planificada";
  const AGENDA_TABLE = "agenda_responsables";

  // ====== Overrides ======
  const OVERRIDE_TABLE = "avance_override";
  const EDITABLE_TYPES = { plan: true, done: false };
  let editMode = false;
  let overridesMap = new Map(); // `${resp}|${fecha}|${tipo}` -> int

  const statusEl = document.getElementById("status");
  const gridEl   = document.getElementById("grid");
  const modalBack = document.getElementById("modalBack");
  const btnCloseModal = document.getElementById("btnCloseModal");
  let chartS;

  // ====== Plugin "línea de hoy" ======
  const TodayLinePlugin = {
    id: 'todayLine',
    afterDraw(chart, args, opts) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const xScale = scales.x;
      const idx = opts?.index;
      if (idx == null || idx < 0) return;

      const x = xScale.getPixelForValue(idx);
      ctx.save();
      ctx.strokeStyle = 'rgba(99,102,241,.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#111';
      ctx.font = '12px system-ui, Arial';
      ctx.fillText('Hoy', x + 6, chartArea.top + 14);
      ctx.restore();
    }
  };



  // ====== Rango por defecto ======
(function setDefaults(){
  // Inicio (deja tu fecha preferida)
  const startFixed = new Date(2025, 8, 1); // 01/09/2025 (mes 8)

  // Fin por defecto: 03/10/2025 (mes 9)
  const endFixed = new Date(2025, 9, 3);   // 03/10/2025

  const startEl = document.getElementById("start");
  const endEl   = document.getElementById("end");

  startEl.value = fmtDate(startFixed);

  // Solo si está vacío, asigna el valor por defecto (por si en algún flujo ya viene con valor)
  if (!endEl.value) endEl.value = fmtDate(endFixed);
  endEl.title = "Sugerido: 2025-10-03 (editable)";

  // Chips activas
  document.querySelectorAll('.chip').forEach(lbl=>{
    const cb = lbl.querySelector('input');
    if (cb.checked) lbl.classList.add('active');
    cb.addEventListener('change', ()=> lbl.classList.toggle('active', cb.checked));
  });
})();




  document.getElementById("btnRun").addEventListener("click", run);

  document.querySelectorAll('.resp').forEach(cb => cb.addEventListener('change', run));

  btnCloseModal.addEventListener('click', closeModal);
  modalBack.addEventListener('click', (e)=>{ if(e.target === modalBack) closeModal(); });

  run();

  function selectedResponsables(){
    const set = new Set();
    document.querySelectorAll('.resp:checked').forEach(cb => set.add(cb.value));
    return set;
  }

  async function run(){
    const start = document.getElementById("start").value;
    const end   = document.getElementById("end").value;
    const allowed = selectedResponsables();
    if(!start || !end){ alert("Selecciona rango de fechas"); return; }
    if(allowed.size === 0){ alert("Selecciona al menos un responsable"); return; }

    status("Cargando…");

    const [rows, agenda, overrides] = await Promise.all([
      fetchAll(),
      fetchAgenda(start, end),
      fetchOverrides(start, end)
    ]);

    overridesMap = buildOverridesMap(overrides);

    const filtered = rows.filter(r => allowed.has((r[RESP_FIELD] ?? "").toString().trim().toLowerCase()));
    status(`Filas: ${rows.length} → filtradas: ${filtered.length}. Generando…`);

    const days = buildDays(new Date(start), new Date(end));
    const { planCounts, doneCounts, cellLists } = buildCounts(filtered, days);

    // Aplica overrides
    applyOverrides(planCounts, doneCounts, days);

    renderGrid(planCounts, doneCounts, days, agenda);
    renderCurve(planCounts, doneCounts, days);
    renderKpis(planCounts, doneCounts, days);
    renderWeekly(planCounts, doneCounts, days);

    window._cellLists = cellLists;
    status("Listo.");
  }

  // ====== Datos ======
  async function fetchAll(){
    const page = 1000; let from = 0, all = [];
    while(true){
      const { data, error } = await sb.from("predios").select("*").order(ID_FIELD, { ascending:true }).range(from, from + page - 1);
      if(error){ console.error(error); alert(error.message); break; }
      all = all.concat(data || []);
      if(!data || data.length < page) break;
      from += page;
    }
    return all;
  }

  async function fetchAgenda(start, end){
    const { data, error } = await sb
      .from(AGENDA_TABLE)
      .select("responsable_tecnico, fecha, tipo, motivo, color")
      .gte("fecha", start)
      .lte("fecha", end);
    if(error){ console.warn("agenda:", error.message); return []; }
    return data || [];
  }

  // ====== Overrides ======
  async function fetchOverrides(start, end){
    const { data, error } = await sb
      .from(OVERRIDE_TABLE)
      .select("responsable_tecnico, fecha, tipo, valor")
      .gte("fecha", start)
      .lte("fecha", end);
    if(error){ console.warn("overrides:", error.message); return []; }
    return data || [];
  }

  function buildOverridesMap(overrides){
    const m = new Map();
    (overrides || []).forEach(o=>{
      const key = `${(o.responsable_tecnico||'').toString()}|${o.fecha}|${o.tipo}`;
      m.set(key, Number(o.valor)||0);
    });
    return m;
  }

  function applyOverrides(planCounts, doneCounts, days){
    const dayKeys = days.map(fmtDate);
    const responsables = Object.keys(planCounts);
    for(const resp of responsables){
      for(const k of dayKeys){
        if(EDITABLE_TYPES.plan){
          const kp = `${resp}|${k}|plan`;
          if(overridesMap.has(kp)) planCounts[resp][k] = overridesMap.get(kp);
        }
        if(EDITABLE_TYPES.done){
          const kd = `${resp}|${k}|done`;
          if(overridesMap.has(kd)) doneCounts[resp][k] = overridesMap.get(kd);
        }
      }
    }
  }

  async function saveOverride(resp, fecha, tipo, valor){
    const { error } = await sb
      .from(OVERRIDE_TABLE)
      .upsert(
        { responsable_tecnico: resp, fecha, tipo, valor: Number(valor)||0 },
        { onConflict: "responsable_tecnico,fecha,tipo" }
      );
    if(error) throw error;
    overridesMap.set(`${resp}|${fecha}|${tipo}`, Number(valor)||0);
  }

  // ====== Helpers ======
  function status(msg){ statusEl.textContent = msg; }
  function fmtDate(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
  function toDateOnly(s){ return s ? s.toString().slice(0,10) : null; }
  function buildDays(d1, d2){ const out=[]; const cur=new Date(d1); while(cur<=d2){ out.push(new Date(cur)); cur.setDate(cur.getDate()+1);} return out; }
  function wdayName(d){ return ["dom","lun","mar","mié","jue","vie","sáb"][d.getDay()]; }
  function escapeHtml(s){
    return (s??"").toString().replace(/[&<>"']/g, m => (
      {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]
    ));
  }
  const sum = arr => arr.reduce((a,b)=>a+b,0);

  const todayKey = (()=>{ const d=new Date(); return fmtDate(d); })();

  // Para mostrar el motivo de agenda en la celda
  const motivoHtml = (a) => (a && a.motivo)
    ? `<div class="motivo">${escapeHtml(a.motivo)}</div>`
    : "";

  function buildCounts(rows, days){
    const dayKeys = days.map(fmtDate);
    const responsables = [...new Set(rows.map(r=> (r[RESP_FIELD]??"").toString().trim().toLowerCase()))]
      .filter(Boolean).sort((a,b)=>a.localeCompare(b));
    const planCounts = {}, doneCounts = {}, cellLists = { plan:new Map(), done:new Map() };
    responsables.forEach(resp=>{
      planCounts[resp] = Object.fromEntries(dayKeys.map(k=>[k,0]));
      doneCounts[resp] = Object.fromEntries(dayKeys.map(k=>[k,0]));
    });
    rows.forEach(r=>{
      const resp = (r[RESP_FIELD]??"").toString().trim().toLowerCase(); if(!resp) return;
      const dPlan = toDateOnly(r[PLAN_FIELD]);
      const dDone = toDateOnly(r[DONE_FIELD]);

      const objForModal = {
        sector: r[SECTOR_FIELD] ?? "",
        codigo_mtc: r[CODE_FIELD] ?? "",
        codigo_preliminar: r[PRELIM_FIELD] ?? ""
      };

      if(dPlan && planCounts[resp] && dPlan in planCounts[resp]){
        planCounts[resp][dPlan] += 1;
        const keyP = `${resp}|${dPlan}`;
        if(!cellLists.plan.has(keyP)) cellLists.plan.set(keyP, []);
        cellLists.plan.get(keyP).push(objForModal);
      }
      if(dDone && doneCounts[resp] && dDone in doneCounts[resp]){
        doneCounts[resp][dDone] += 1;
        const keyD = `${resp}|${dDone}`;
        if(!cellLists.done.has(keyD)) cellLists.done.set(keyD, []);
        cellLists.done.get(keyD).push(objForModal);
      }
    });
    return { planCounts, doneCounts, cellLists };
  }

  function buildAgendaMap(agenda){
    const m = new Map();
    agenda.forEach(a=>{
      const resp = (a.responsable_tecnico ?? "").toString().trim().toLowerCase();
      const key = `${resp}|${a.fecha}`;
      m.set(key, a);
    });
    return m;
  }

  // ====== Render tabla diaria ======
  function renderGrid(planCounts, doneCounts, days, agenda){
    const agendaMap = buildAgendaMap(agenda);
    const responsables = Object.keys(planCounts);
    const dayKeys = days.map(fmtDate);

    const planTotalsByDay = dayKeys.map(k => responsables.reduce((acc,r)=> acc + (planCounts[r][k]||0), 0));
    const doneTotalsByDay = dayKeys.map(k => responsables.reduce((acc,r)=> acc + (doneCounts[r][k]||0), 0));
    const grandPlan = sum(planTotalsByDay);
    const grandDone = sum(doneTotalsByDay);

    let html = "";

    // Encabezado
    html += "<tr>";
    html += `<th class="sticky l1">RESPONSABLE</th>`;
    html += `<th class="sticky l2">TIPO</th>`;
    days.forEach(d=>{
      const k = fmtDate(d);
      const dd = String(d.getDate()).padStart(2,'0');
      const cls = (k===todayKey ? "today " : "") + (d.getDay()===0 ? "sun" : d.getDay()===6 ? "sat" : "");
      html += `<th class="${cls}">${dd}<div class="wday">${wdayName(d)}</div></th>`;
    });
    html += `<th>TOTAL</th>`;
    html += "</tr>";

    // Filas por responsable
    responsables.forEach(resp=>{
      const planRowTotal = dayKeys.reduce((acc,k)=> acc + (planCounts[resp][k]||0), 0);
      const doneRowTotal = dayKeys.reduce((acc,k)=> acc + (doneCounts[resp][k]||0), 0);

      // Planificado (editable)
      html += `<tr>`;
      html += `<td class="sticky l1 respname" rowspan="2">${escapeHtml(resp)}</td>`;
      html += `<td class="sticky l2 subrow">Planificado</td>`;
      days.forEach(d=>{
        const k = fmtDate(d);
        const n = planCounts[resp][k] || 0;
        const clsDay = (k===todayKey ? "today " : "") + (d.getDay()===0 ? "sun" : d.getDay()===6 ? "sat" : "");
        const a = agendaMap.get(`${resp}|${k}`);
        const clsMark = a ? `mark ${ (a.tipo||'').toLowerCase() }` : "";
        const style = a && a.color ? ` style="box-shadow: inset 0 0 0 9999px ${a.color};"` : "";

        if(editMode && EDITABLE_TYPES.plan){
          const okey = `${resp}|${k}|plan`;
          const val = overridesMap.has(okey) ? overridesMap.get(okey) : n;
          html += `<td class="${clsDay} ${clsMark}"${style}>
            <div class="cell">
              <input class="ovr-input" type="number" min="0"
                     data-resp="${escapeHtml(resp)}" data-date="${k}" data-tipo="plan"
                     value="${val}">
              ${motivoHtml(a)}
            </div>
          </td>`;
        }else{
          html += `<td class="${clsDay} ${clsMark}"${style}>
            <div class="cell">
              <div>${n || 0}</div>
              ${motivoHtml(a)}
            </div>
          </td>`;
        }
      });
      html += `<td class="totalrow">${planRowTotal}</td>`;
      html += `</tr>`;

      // Elaborado (clic abre modal)
      html += `<tr>`;
      html += `<td class="sticky l2 subrow">Elaborado</td>`;
      days.forEach(d=>{
        const k = fmtDate(d);
        const n = doneCounts[resp][k] || 0;
        const clsDay = (k===todayKey ? "today " : "") + (d.getDay()===0 ? "sun" : d.getDay()===6 ? "sat" : "");
        const a = agendaMap.get(`${resp}|${k}`);
        const clsMark = a ? `mark ${ (a.tipo||'').toLowerCase() }` : "";
        const style = a && a.color ? ` style="box-shadow: inset 0 0 0 9999px ${a.color};"` : "";

        if(n > 0){
          html += `<td class="${clsDay} ${clsMark} clickable"${style}
                    onclick="openCell('done','${escapeHtml(resp)}','${k}')">
            <div class="cell">
              <div>${n}</div>
              ${motivoHtml(a)}
            </div>
          </td>`;
        }else{
          html += `<td class="${clsDay} ${clsMark} zero"${style}>
            <div class="cell">
              <div>0</div>
              ${motivoHtml(a)}
            </div>
          </td>`;
        }
      });
      html += `<td class="totalrow">${doneRowTotal}</td>`;
      html += `</tr>`;
    });

    // Totales finales
    html += `<tr class="totalrow">`;
    html += `<td class="sticky l1 totalrow" rowspan="2">TOTAL</td>`;
    html += `<td class="sticky l2 totalrow">Planificado</td>`;
    days.forEach((d, i)=>{
      const k = fmtDate(d);
      const clsDay = (k===todayKey ? "today " : "") + (d.getDay()===0 ? "sun" : d.getDay()===6 ? "sat" : "");
      html += `<td class="${clsDay} totalrow">${planTotalsByDay[i]}</td>`;
    });
    html += `<td class="totalrow">${grandPlan}</td>`;
    html += `</tr>`;

    html += `<tr class="totalrow">`;
    html += `<td class="sticky l2 totalrow">Elaborado</td>`;
    days.forEach((d, i)=>{
      const k = fmtDate(d);
      const clsDay = (k===todayKey ? "today " : "") + (d.getDay()===0 ? "sun" : d.getDay()===6 ? "sat" : "");
      html += `<td class="${clsDay} totalrow">${sum(Object.values(doneCounts).map(obj=>obj[k]||0))}</td>`;
    });
    html += `<td class="totalrow">${grandDone}</td>`;
    html += `</tr>`;

    gridEl.innerHTML = html;
  }

  // Guardar override al cambiar un input (PLANIFICADO)
  gridEl.addEventListener("change", async (e)=>{
    const inp = e.target.closest(".ovr-input");
    if(!inp) return;
    const resp  = inp.getAttribute("data-resp");
    const fecha = inp.getAttribute("data-date");
    const tipo  = inp.getAttribute("data-tipo"); // 'plan'
    const valor = Number(inp.value)||0;

    try{
      await saveOverride(resp, fecha, tipo, valor);
      status("Guardado ✓");
      run(); // refresca todo
    }catch(err){
      console.error(err);
      status("Error al guardar: " + (err?.message||""));
    }
  });

  // ====== Curva S (acumulado total) ======
  function renderCurve(planCounts, doneCounts, days){
    // Etiquetas DD/MM
    const labels = days.map(d => {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      return `${dd}/${mm}`;
    });

    const dayKeys = days.map(fmtDate);
    const responsables = Object.keys(planCounts);

    // Sumas diarias totales
    const planDaily = dayKeys.map(k => responsables.reduce((acc,r)=>acc + (planCounts[r][k]||0), 0));
    const doneDaily = dayKeys.map(k => responsables.reduce((acc,r)=>acc + (doneCounts[r][k]||0), 0));

    // Índices clave
    const todayKeyLocal = fmtDate(new Date());
    const todayIndex = dayKeys.indexOf(todayKeyLocal);

    // Tope planificado: 08/oct/2025 (mes 9)
    const PLAN_CAP_DATE = new Date(2025, 9, 8);
    const planCapKey = fmtDate(PLAN_CAP_DATE);
    let planCapIndex = dayKeys.lastIndexOf(planCapKey);
    if (planCapIndex === -1){
      // último índice <= cap
      planCapIndex = -1;
      for (let i=0;i<dayKeys.length;i++){
        if (dayKeys[i] <= planCapKey) planCapIndex = i;
      }
    }

    // Acumulados
    let s=0;
    const planCumCapped = planDaily.map((v, i) => {
      if (planCapIndex >= 0){
        if (i <= planCapIndex){ s += v; return s; }
        return s; // plano tras 08/10
      } else {
        return 0;
      }
    });

    s = 0;
    const doneCumTruncated = doneDaily.map((v, i) => {
      if (todayIndex >= 0 && i > todayIndex) return null; // cortar después de hoy
      s += v; return s;
    });

    const canvas = document.getElementById('sCurve');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartS) chartS.destroy();
    Chart.register(ChartDataLabels, TodayLinePlugin);

    chartS = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Acum Planificado (fijo al 08/10)',
            data: planCumCapped,
            tension: 0.25,
            pointRadius: 3
          },
          {
            label: 'Acum Elaborado (hasta hoy)',
            data: doneCumTruncated,
            tension: 0.25,
            pointRadius: 3,
            spanGaps: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          datalabels: {
            formatter: v => (v>0? v : ''),
            align: 'top',
            anchor: 'end',
            font: { size: 10 }
          },
          tooltip: { enabled: true },
          // opciones del plugin "todayLine"
          todayLine: { index: todayIndex }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
//RENDER KPIIIISS
function renderKpis(planCounts, doneCounts, days){
  const dayKeys = days.map(fmtDate);
  const responsables = Object.keys(planCounts);

  // Utils
  const sumArr = (a) => a.reduce((x,y)=>x+y,0);
  const sumSlice = (a, endIdx) => endIdx >= 0 ? sumArr(a.slice(0, endIdx+1)) : 0;

  // Totales diarios (sumando todos los responsables)
  const planDaily = dayKeys.map(k => responsables.reduce((acc,r)=> acc + (planCounts[r][k]||0), 0));
  const doneDaily = dayKeys.map(k => responsables.reduce((acc,r)=> acc + (doneCounts[r][k]||0), 0));

  // ===== General (todo el rango) =====
  const planTotalAll = sumArr(planDaily);
  const doneTotalAll = sumArr(doneDaily);
  const pctTotal = planTotalAll ? Math.round((doneTotalAll/planTotalAll)*100) : 0;

  document.getElementById('kpiPlanTotal').textContent = planTotalAll;
  document.getElementById('kpiDoneTotal').textContent = doneTotalAll;
  document.getElementById('kpiPctTotal').textContent  = pctTotal + '%';

  const startStr = document.getElementById("start").value;
  const endStr   = document.getElementById("end").value;
  document.getElementById('kpiGeneralRange').textContent = `${startStr} → ${endStr}`;

  // ===== Hasta hoy (acumulado) =====
  const todayStr = fmtDate(new Date());

  // último índice <= hoy (si hoy no está exacto en el rango)
  let todayIdx = dayKeys.indexOf(todayStr);
  if (todayIdx === -1){
    todayIdx = -1;
    for (let i=0; i<dayKeys.length; i++){
      if (dayKeys[i] <= todayStr) todayIdx = i;
    }
  }

  const planToToday = sumSlice(planDaily, todayIdx);
  const doneToToday = sumSlice(doneDaily, todayIdx);
  const pctToToday  = planToToday ? Math.round((doneToToday/planToToday)*100) : 0;

  document.getElementById('kpiPlanToToday').textContent = planToToday;
  document.getElementById('kpiDoneToToday').textContent = doneToToday;
  document.getElementById('kpiPctToToday').textContent  = pctToToday + '%';

  // etiqueta del corte (min(end, hoy))
  const cutoff = (endStr && endStr < todayStr) ? endStr : todayStr;
  document.getElementById('kpiTodayRange').textContent =
    `${startStr} → ${cutoff}${todayIdx === -1 ? ' (hoy fuera del rango)' : ''}`;

  // ===== Top responsables (avance hasta hoy) =====
  const arr = responsables.map(r=>{
    const planByDayR = dayKeys.map(k => (planCounts[r][k]||0));
    const doneByDayR = dayKeys.map(k => (doneCounts[r][k]||0));
    const pToday = sumSlice(planByDayR, todayIdx);
    const dToday = sumSlice(doneByDayR, todayIdx);
    const pct    = pToday ? (dToday/pToday)*100 : 0;
    return { r: r.replace(/\b\w/g, m=>m.toUpperCase()), p: pToday, d: dToday, pct };
  }).sort((a,b)=> b.pct - a.pct);

  const cont = document.getElementById('kpiLeaders');
  cont.innerHTML = arr.map(x =>
    `<div class="leader"><span>${x.r}</span><span><span class="badge">${x.d}/${x.p}</span> ${Math.round(x.pct)}%</span></div>`
  ).join('');
}




  function capResp(r){ return r.replace(/\b\w/g, m=>m.toUpperCase()); }

  // ====== Resumen semanal (compacto) ======
  function renderWeekly(planCounts, doneCounts, days){
    const dayKeys = days.map(fmtDate);
    const responsables = Object.keys(planCounts);

    // mapa semana -> {plan, done}
    const weeks = new Map(); // key = YYYY-MM-DD (lunes)
    dayKeys.forEach(k=>{
      const wk = weekKey(new Date(k));
      if(!weeks.has(wk)) weeks.set(wk, {plan:0, done:0});
      const agg = weeks.get(wk);
      responsables.forEach(r=>{
        agg.plan += (planCounts[r][k]||0);
        agg.done += (doneCounts[r][k]||0);
      });
    });

    // Render
    let html = `<tr>
      <th>Semana (lunes)</th>
      <th>Planificado</th>
      <th>Elaborado</th>
      <th>Avance %</th>
    </tr>`;
    for(const [wk, v] of weeks){
      const pct = v.plan ? Math.round((v.done/v.plan)*100) : 0;
      html += `<tr>
        <td>${wk}</td>
        <td>${v.plan}</td>
        <td>${v.done}</td>
        <td>${pct}%</td>
      </tr>`;
    }
    document.getElementById('weeklyTbl').innerHTML = html;
  }

  function weekKey(d){
    // ISO-like: lunes inicio
    const day = d.getDay(); // 0=dom, 1=lun
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMon);
    const y = monday.getFullYear();
    const m = String(monday.getMonth()+1).padStart(2,'0');
    const dd= String(monday.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  // ====== Modal (Elaborado) ======
  function openCell(kind, resp, ymd){
    const map = window._cellLists.done;
    const list = map.get(`${resp}|${ymd}`) || [];

    const rowsHtml = list.length
      ? `<table>
           <thead>
             <tr>
               <th>Sector</th>
               <th>Código MTC</th>
               <th>Código Preliminar</th>
             </tr>
           </thead>
           <tbody>
             ${list.map(o=>`
               <tr>
                 <td>${escapeHtml(o.sector)}</td>
                 <td>${escapeHtml(o.codigo_mtc)}</td>
                 <td>${escapeHtml(o.codigo_preliminar)}</td>
               </tr>`).join("")}
           </tbody>
         </table>`
      : "<div style='padding:8px'><em>Sin códigos</em></div>";

    document.getElementById("modalTitle").textContent = `Elaborado — ${resp} — ${ymd}`;
    document.getElementById("modalList").innerHTML = rowsHtml;

    document.body.classList.add('no-scroll');
    modalBack.style.display = "flex";
  }
  function closeModal(){
    modalBack.style.display = "none";
    document.body.classList.remove('no-scroll');
  }
