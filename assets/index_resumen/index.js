// ====== Supabase ======
  const SUPABASE_URL = "https://wbzxbfqowlfmmkwqeyam.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndienhiZnFvd2xmbW1rd3FleWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODUwMDQsImV4cCI6MjA3MjU2MTAwNH0.mJJ7yID73tUerWE_aiNw3ZE4o-Q9YrT39YN-iS2CksA";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Campos
  const FIELDS = {
    pk: "id",               // cambia si tu PK es otra
    code: "codigo_preliminar",
    comunidad: "comunidad",
    entregable: "entregable",
    responsable: "responsable_tecnico",
    grupo: "grupo"
  };

  let RAW = [], FILTERED = [];
  let DTs = {};
  let CELL_INDEX = new Map();
  const statusEl = document.getElementById("status");

  // ===== Utils =====
  const uniq = arr => [...new Set(arr)];
  const escapeHtml = s => (s??"").toString().replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;","&gt":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  function countBy(rows, key){ const m=new Map(); rows.forEach(r=>{const k=r[key]??"(vacío)"; m.set(k,(m.get(k)||0)+1)}); return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]); }
  function renderBreakTable(tuples, tableId){
    const tb = document.querySelector(`#${tableId} tbody`);
    tb.innerHTML = tuples.length ? tuples.map(([k,n])=>`<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${n}</td></tr>`).join("")
                                 : `<tr><td colspan="2"><em>Sin datos</em></td></tr>`;
  }
  function renderBadges(tuples, el){
    el.innerHTML = tuples.map(([label,val]) =>
      `<span class="badge"><span>${escapeHtml(label)}</span><span class="k">${val}</span></span>`).join("");
  }
  function toCSV(rows, fields){
    const header = fields.join(",");
    const esc = v => `"${String(v??"").replace(/"/g,'""')}"`;
    const body = rows.map(r => fields.map(f=>esc(r[f])).join(",")).join("\n");
    return header + "\n" + body;
  }
  function download(filename, text){
    const blob = new Blob([text], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // Orden especial de ENTREGABLE: "1° Entregable" primero, luego 1..5, luego resto
  function sortEntKeys(keys){
    const firstLabels = new Set(["1° Entregable","1º Entregable","1er Entregable"]);
    let hasFirst = false;
    const nums = [], others = [];
    keys.forEach(k=>{
      const s = String(k);
      if (firstLabels.has(s)) { hasFirst = true; return; }
      if (/^\d+$/.test(s)) nums.push(parseInt(s,10));
      else others.push(s);
    });
    nums.sort((a,b)=>a-b);
    others.sort((a,b)=>a.localeCompare(b));
    const out = [];
    if (hasFirst) out.push("1° Entregable");
    out.push(...nums.map(n=>String(n)));
    out.push(...others);
    return out;
  }

  // Pivot genérico (con orden especial para columnas = entregable)
  function pivotCount(rows, rowKey, colKey){
    const rowsKeys = uniq(rows.map(r=>r[rowKey]).filter(v=>v!=null)).sort((a,b)=> String(a).localeCompare(String(b)));
    let colKeys  = uniq(rows.map(r=>r[colKey]).filter(v=>v!=null));
    colKeys = (colKey===FIELDS.entregable) ? sortEntKeys(colKeys) : colKeys.sort((a,b)=> String(a).localeCompare(String(b)));

    const grid = new Map();
    const cellIndex = new Map();
    rows.forEach(r=>{
      const rk=r[rowKey], ck=r[colKey]; if(rk==null||ck==null) return;
      grid.set(rk+"|"+ck, (grid.get(rk+"|"+ck)||0)+1);
      const k = rowKey+":"+rk+"|"+colKey+":"+ck;
      if(!cellIndex.has(k)) cellIndex.set(k, []);
      cellIndex.get(k).push(r[FIELDS.code] ?? "(sin código)");
    });
    return { rowsKeys, colKeys, grid, cellIndex };
  }

  function buildTable(pivot, rowTitle, colTitle, tableIds, clickKind){
    const { rowsKeys, colKeys, grid, cellIndex } = pivot;
    CELL_INDEX.set(clickKind, cellIndex);

    document.getElementById(tableIds.head).innerHTML =
      `<tr><th>${escapeHtml(rowTitle)}</th>${colKeys.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}<th class="tot">Total</th></tr>`;

    let body = "";
    rowsKeys.forEach(rk=>{
      let tot=0;
      const tds = colKeys.map(ck=>{
        const v = grid.get(rk+"|"+ck) || 0; tot+=v;
        return v>0
          ? `<td class="clickable" data-kind="${clickKind}" data-r="${escapeHtml(rk)}" data-c="${escapeHtml(ck)}" title="Ver códigos">${v}</td>`
          : `<td>0</td>`;
      }).join("");
      body += `<tr><td>${escapeHtml(rk)}</td>${tds}<td class="tot">${tot}</td></tr>`;
    });
    document.getElementById(tableIds.body).innerHTML = body;

    let foot = `<tr><td class="tot">Total</td>`;
    let grand=0; colKeys.forEach(ck=>{
      let s=0; rowsKeys.forEach(rk=> s += (grid.get(rk+"|"+ck)||0)); grand+=s;
      foot += `<td class="tot">${s}</td>`;
    });
    foot += `<td class="tot">${grand}</td></tr>`;
    document.getElementById(tableIds.foot).innerHTML = foot;

    if (DTs[tableIds.table]) DTs[tableIds.table].destroy();
    DTs[tableIds.table] = new DataTable("#"+tableIds.table, {
      pageLength: 250,
      lengthMenu: [[25,50,100,250,-1],[25,50,100,250,"Todos"]],
      pagingType: 'numbers',
      lengthChange: true, ordering: true, searching: true, scrollX: false
    });

    document.querySelectorAll(`#${tableIds.body} td.clickable`).forEach(td=>{
      td.addEventListener("click", ()=>{
        openModal(clickKind, td.getAttribute("data-r"), td.getAttribute("data-c"));
      });
    });
  }

  // Totales en badges (con orden especial)
  function renderTotalsBadges(rows){
    const wrap = document.getElementById("totalsBadges");
    const map = new Map();
    rows.forEach(r=>{
      const k = r[FIELDS.entregable]; if (k==null) return;
      map.set(k, (map.get(k)||0) + 1);
    });
    const orderedKeys = sortEntKeys(Array.from(map.keys()));
    const items = orderedKeys.map(k => [k, map.get(k) || 0]);
    wrap.innerHTML = items.length
      ? items.map(([label, n])=>`<span class="badge"><span>${escapeHtml(label)}</span><span class="k">${n}</span></span>`).join("")
      : "<em>Sin datos</em>";
  }

  // ==== Modal PRO (drill-down) ====
  function openModal(kind, rowVal, colVal){
    let kRow, kCol, breakA, breakB, labelA, labelB;
    if (kind === "ComEnt"){            // Comunidad × Entregable
      kRow = FIELDS.comunidad; kCol = FIELDS.entregable;
      breakA = FIELDS.responsable; labelA = "Por Responsable";
      breakB = FIELDS.entregable;  labelB = "Por Entregable";
    } else if (kind === "RespEnt"){    // Responsable × Entregable
      kRow = FIELDS.responsable; kCol = FIELDS.entregable;
      breakA = FIELDS.comunidad;  labelA = "Por Comunidad";
      breakB = FIELDS.entregable; labelB = "Por Entregable";
    } else {                           // ComResp = Comunidad × Responsable
      kRow = FIELDS.comunidad; kCol = FIELDS.responsable;
      breakA = FIELDS.entregable; labelA = "Por Entregable";
      breakB = FIELDS.responsable; labelB = "Por Responsable";
    }

    const subset = FILTERED.filter(r => String(r[kRow])===String(rowVal) && String(r[kCol])===String(colVal));
    const codes = subset.map(r => r[FIELDS.code] ?? "(sin código)");

    document.getElementById("mdTitle").textContent = `Detalle — ${rowVal} × ${colVal}`;
    document.getElementById("mdContext").innerHTML = `Dentro de <strong>${FILTERED.length}</strong> filas. Coincidencias: <strong>${subset.length}</strong>.`;

    const badges = [
      ["Códigos", codes.length],
      ["Comunidades distintas", new Set(subset.map(r=>r[FIELDS.comunidad])).size],
      ["Entregables distintos", new Set(subset.map(r=>r[FIELDS.entregable])).size],
      ["Responsables distintos", new Set(subset.map(r=>r[FIELDS.responsable])).size],
    ];
    renderBadges(badges, document.getElementById("mdBadges"));

    document.querySelector(`#mdBreak1`).previousElementSibling.textContent = labelA;
    document.querySelector(`#mdBreak2`).previousElementSibling.textContent = labelB;
    renderBreakTable(countBy(subset, breakA), "mdBreak1");
    renderBreakTable(countBy(subset, breakB), "mdBreak2");

    document.getElementById("mdList").innerHTML = codes.length
      ? codes.map(c=>`<span class="pill">${escapeHtml(c)}</span>`).join("")
      : "<em>Sin códigos</em>";

    const copy = () => navigator.clipboard.writeText(codes.join("\n"));
    document.getElementById("btnCopy").onclick = copy;
    document.getElementById("btnCSV").onclick = () => {
      const fields = [FIELDS.code, FIELDS.comunidad, FIELDS.entregable, FIELDS.responsable, FIELDS.grupo];
      download(`detalle_${rowVal}_${colVal}.csv`, toCSV(subset, fields));
    };
    document.getElementById("btnGo").href = `index_predios.html?q=${encodeURIComponent(String(rowVal))}`;

    document.getElementById("back").style.display = "flex";
  }
  function closeModal(){ document.getElementById("back").style.display = "none"; }
  window.closeModal = closeModal;

  // ===== Carga y render =====
  async function fetchAllRows(){
    const cols = [FIELDS.pk, FIELDS.code, FIELDS.comunidad, FIELDS.entregable, FIELDS.responsable, FIELDS.grupo].join(", ");
    const page = 1000; let from = 0, all=[];
    while(true){
      const { data, error } = await sb.from("predios").select(cols).order(FIELDS.pk, {ascending:true}).range(from, from+page-1);
      if(error){ console.error(error); break; }
      all = all.concat(data||[]);
      if(!data || data.length<page) break;
      from += page;
    }
    return all;
  }

  function renderAll(){
    // pivots
    const pv1 = pivotCount(FILTERED, FIELDS.comunidad, FIELDS.entregable);
    buildTable(pv1, "COMUNIDAD", "Entregable",
      {table:"pvComEnt", head:"pvComEntHead", body:"pvComEntBody", foot:"pvComEntFoot"}, "ComEnt");

    const pv2 = pivotCount(FILTERED, FIELDS.responsable, FIELDS.entregable);
    buildTable(pv2, "RESPONSABLE", "Entregable",
      {table:"pvRespEnt", head:"pvRespEntHead", body:"pvRespEntBody", foot:"pvRespEntFoot"}, "RespEnt");

    const pv3 = pivotCount(FILTERED, FIELDS.comunidad, FIELDS.responsable);
    buildTable(pv3, "COMUNIDAD", "Responsable",
      {table:"pvComResp", head:"pvComRespHead", body:"pvComRespBody", foot:"pvComRespFoot"}, "ComResp");

    // Totales (badges)
    renderTotalsBadges(FILTERED);
  }

  async function run(){
    statusEl.textContent = "Cargando…";
    RAW = await fetchAllRows();
    FILTERED = RAW.slice();
    renderAll();
    statusEl.textContent = `Listo. Filas: ${RAW.length}`;
  }
  run();
