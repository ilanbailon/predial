window.addEventListener('load', ()=>{
    const h = document.querySelector('header.appbar')?.offsetHeight || 74;
    document.documentElement.style.setProperty('--header-h', h+'px');
  });

  const SUPABASE_URL = "https://wbzxbfqowlfmmkwqeyam.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndienhiZnFvd2xmbW1rd3FleWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODUwMDQsImV4cCI6MjA3MjU2MTAwNH0.mJJ7yID73tUerWE_aiNw3ZE4o-Q9YrT39YN-iS2CksA";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const PRIMARY_KEY = "id";

  // ======== COLUMNAS ========
  const visibleColumns = [
    { key: "comunidad",            title: "Comunidad" },
    { key: "codigo_preliminar",    title: "Código" },
    { key: "codigo_mtc",           title: "Código MTC" },
    { key: "nombre_razon_social",  title: "Nombre / Razón Social" },
    { key: "condicion_juridica",   title: "Condición Jurídica" },
    { key: "fecha_elaboracion",    title: "Fecha de elaboración" },
  ];

  // 👉 Agrego 'fecha_elaboracion' a columnas ocultas para poder FILTRAR por fecha
  const hiddenFilterColumns = ["entregable","responsable_tecnico","fecha_elaboracion"];

  const detailColumns = [
    { key: "comunidad",            title: "Comunidad",            type:"text" },
    { key: "codigo_mtc",           title: "Código MTC",           type:"text" },
    { key: "cod_exp",              title: "Código Exp",           type:"text" },
    { key: "cod_pu",               title: "Cód Plano Ubi",        type:"text" },
    { key: "cod_pp",               title: "Cód Plano Per",        type:"text" },
    { key: "cod_pa",               title: "Cód Plano Afec",       type:"text" },
    { key: "nombre_razon_social",  title: "Nombre / Razón Social",type:"text" },
    { key: "codigo_preliminar",    title: "Código",               type:"text" },
    { key: "prog_ini",             title: "Prog. Inicial",        type:"text" },
    { key: "prog_fin",             title: "Prog. Final",          type:"text" },
    { key: "lado",                 title: "Lado",                 type:"text" },
    { key: "condicion_juridica",   title: "Condición Jurídica",   type:"text" },
    { key: "fecha_elaboracion",    title: "Fecha de elaboración", type:"date" },
  ];

  const allColumns = [
    ...visibleColumns.map(c => ({...c, hidden:false})),
    ...hiddenFilterColumns.map(k => ({ key:k, title:k, hidden:true }))
  ];

  const selectColumns = Array.from(new Set([
    PRIMARY_KEY,
    ...allColumns.map(c=>c.key),
    ...detailColumns.map(c=>c.key),
  ])).join(", ");

  let dt;
  let _rowsCache = new Map();
  let _allRows = [];
  let inlineEditCols = { codigo_mtc: false, nombre_razon_social: false };

  const toDateOnly = v => {
    if(!v) return "";
    const s = v.toString();
    // Soporta ISO o Date
    return s.length >= 10 ? s.slice(0,10) : s;
  };
  function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  const idxOf = key => allColumns.findIndex(c => c.key === key);

  function buildThead(){
    const ths = allColumns.map(c => {
      const hiddenCls = c.hidden ? 'col-hidden' : '';
      const resizer = !c.hidden ? `<span class="resizer" data-resize="${c.key}"></span>` : '';
      const wantsHdrBtn = !c.hidden && (
        c.key === "codigo_mtc" ||
        c.key === "cod_exp" ||
        c.key === "cod_pu" ||
        c.key === "cod_pp" ||
        c.key === "cod_pa" ||
        c.key === "fecha_elaboracion" ||
        c.key === "nombre_razon_social"
      );
      const editBtn = wantsHdrBtn
        ? ` <button class="hdr-btn" data-col="${c.key}" aria-pressed="false" title="Editar en tabla">✎</button>`
        : '';
      return `<th class="${hiddenCls}" data-key="${c.key}" style="position:relative;">${c.title}${editBtn}${resizer}</th>`;
    }).join("");
    const thAcciones = `<th data-key="acciones" style="position:relative;">Acciones</th>`;
    document.getElementById("thead-titles").innerHTML = ths + thAcciones;
    enableColumnResize();
  }

  async function fetchAllRows(){
    const pageSize = 1000;
    let from = 0, all = [];
    while (true) {
      const { data, error } = await supabase
        .from("predios").select(selectColumns)
        .order(PRIMARY_KEY, { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) { console.error(error); break; }
      (data || []).forEach(r => _rowsCache.set(r[PRIMARY_KEY], r));
      all = all.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    _allRows = all;
    return all;
  }

  async function fetchRowById(id){
    if(!id){ return null; }
    const { data, error } = await supabase.from("predios").select(selectColumns).eq(PRIMARY_KEY, id).limit(1).maybeSingle();
    if(error){ console.error("fetchRowById error:", error); return null; }
    return data || null;
  }

  function fillTbody(rows){
    const tbody = document.getElementById("tbody-rows");
    const trs = rows.map(r => {
      const tds = allColumns.map(col => {
        let val = r[col.key];
        // 👉 Normalizo fecha en la celda (aunque esté oculta) para que el filtro exacto funcione
        if(col.key === "fecha_elaboracion") val = toDateOnly(val);
        const hiddenCls = col.hidden ? 'col-hidden' : '';
        return `<td class="${hiddenCls}">${(val ?? "").toString()}</td>`;
      }).join("");
      const rawId = r[PRIMARY_KEY] ?? "";
      const btn = `<td><div class="row-actions">
        <button class="btn btn-small" style="background:#111827" data-action="ver" data-id="${rawId}">Ver</button>
      </div></td>`;
      const safeRow = encodeURIComponent(JSON.stringify(r));
      return `<tr data-id="${rawId}" data-row="${safeRow}">${tds}${btn}</tr>`;
    }).join("");
    tbody.innerHTML = trs;
  }

  function initDataTableAndExternalFilters(rows){
    dt = new DataTable("#tabla", {
      pageLength: 250,
      lengthMenu: [[25, 50, 100, 250, -1],[25, 50, 100, 250, "Todos"]],
      lengthChange: true,
      ordering: true,
      searching: true,
      columnDefs: [
        { targets: allColumns.map((c, i) => c.hidden ? i : -1).filter(x=>x>=0),
          visible: false, searchable: true }
      ]
    });

    const fillUnique = (key, selectId, mapFn) => {
      const unique = [...new Set(_allRows
        .map(r => {
          const v = (r[key] ?? "");
          return mapFn ? mapFn(v) : v.toString();
        })
        .filter(v => (v ?? "").toString().trim() !== ""))]
        .sort((a,b)=>a.localeCompare(b));
      const sel = document.getElementById(selectId);
      unique.forEach(v => { const o = document.createElement("option"); o.value=v; o.textContent=v; sel.appendChild(o); });
    };

    fillUnique("comunidad", "f_comunidad");
    fillUnique("entregable", "f_entregable");
    fillUnique("responsable_tecnico", "f_responsable");
    // 👉 Ahora sí llenamos fechas normalizadas YYYY-MM-DD
    fillUnique("fecha_elaboracion", "f_fecha", toDateOnly);

    const applyExternalFilters = ()=>{
      const comunidad = document.getElementById("f_comunidad").value;
      const ent       = document.getElementById("f_entregable").value;
      const resp      = document.getElementById("f_responsable").value;
      const felab     = document.getElementById("f_fecha").value;

      const idxCom   = idxOf("comunidad");
      const idxEnt   = idxOf("entregable");
      const idxResp  = idxOf("responsable_tecnico");
      const idxFecha = idxOf("fecha_elaboracion");

      if (idxCom   >= 0) dt.column(idxCom  ).search(comunidad ? '^'+escapeRegex(comunidad)+'$' : '', true, false);
      if (idxEnt   >= 0) dt.column(idxEnt  ).search(ent       ? '^'+escapeRegex(ent      )+'$' : '', true, false);
      if (idxResp  >= 0) dt.column(idxResp ).search(resp      ? '^'+escapeRegex(resp     )+'$' : '', true, false);
      if (idxFecha >= 0) dt.column(idxFecha).search(felab     ? '^'+escapeRegex(felab    )+'$' : '', true, false);
      dt.draw();
    };

    document.getElementById("f_comunidad").addEventListener("change", applyExternalFilters);
    document.getElementById("f_entregable").addEventListener("change", applyExternalFilters);
    document.getElementById("f_responsable").addEventListener("change", applyExternalFilters);
    document.getElementById("f_fecha").addEventListener("change", applyExternalFilters);

    document.getElementById("btnClear").addEventListener("click", ()=>{
      document.getElementById("f_comunidad").value = "";
      document.getElementById("f_entregable").value = "";
      document.getElementById("f_responsable").value = "";
      document.getElementById("f_fecha").value = "";
      applyExternalFilters();
      dt.search('').draw();
    });

    document.getElementById("tabla").addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-action='ver']");
      if(!btn) return;
      openDetailModal(btn.getAttribute("data-id"));
    });
  }

  function setInlineEdit(colKey, on){
    inlineEditCols[colKey] = on;
    const colIdx = idxOf(colKey);
    if(colIdx < 0) return;

    const isDateCol = (k)=> k === 'fecha_elaboracion';

    dt.rows({ search: 'applied' }).every(function(){
      const tr = this.node();
      const td = tr.children[colIdx];
      if(!td) return;

      if(on){
        if(td.querySelector('input.cell-input')) return;

        const currentRaw = td.textContent;
        const current = isDateCol(colKey) ? toDateOnly(currentRaw) : currentRaw;
        const typeAttr = isDateCol(colKey) ? 'date' : 'text';

        td.innerHTML = `<input class="cell-input" data-field="${colKey}" type="${typeAttr}" value="${(current ?? '').toString()}">`;
      }else{
        const inp = td.querySelector('input.cell-input');
        if(!inp) return;
        const val = inp.value;
        td.textContent = isDateCol(colKey) ? toDateOnly(val) : val;
      }
    });
  }


  const $thead = document.getElementById("thead-titles");
  $thead.addEventListener("mousedown", (e)=>{
    if (e.target.closest(".hdr-btn")) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  $thead.addEventListener("click", (e)=>{
    const btn = e.target.closest(".hdr-btn");
    if (!btn) return;
    e.stopPropagation(); e.preventDefault();
    const col = btn.getAttribute("data-col");
    const newState = !(inlineEditCols[col]);
    btn.setAttribute("aria-pressed", String(newState));
    setInlineEdit(col, newState);
  });

  $("#tabla").on("keydown", "input.cell-input", function(e){
    if(e.key === "Escape"){ const td = this.closest("td"); td.textContent = this.defaultValue; }
    if(e.key === "Enter"){ this.blur(); }
  });
  $("#tabla").on("change", "input.cell-input", async function(){
    const tr = this.closest("tr");
    const id = tr.getAttribute("data-id");
    const field = this.getAttribute("data-field");
    const value = this.value;
    try{
      await updateRow(id, { [field]: value });
      updateRowInTable(id, { [field]: value });
      this.defaultValue = value;
    }catch(err){
      alert("Error al actualizar: " + (err?.message || ""));
      const td = this.closest("td"); td.textContent = this.defaultValue;
    }
  });

  async function updateRow(id, payload){
    const { error } = await supabase.from("predios").update(payload).eq(PRIMARY_KEY, id);
    if (error) throw error;
    const row = _rowsCache.get(id) || {};
    Object.assign(row, payload);
    _rowsCache.set(id, row);
    const idx = _allRows.findIndex(r => r[PRIMARY_KEY] === id);
    if(idx >= 0) Object.assign(_allRows[idx], payload);
  }

  function updateRowInTable(id, payload){
    const tr = document.querySelector(`tr[data-id="${id}"]`);
    if(!tr) return;
    const headers = Array.from(document.querySelectorAll("#thead-titles th"));
    const keyToIndex = {};
    headers.forEach((th, idx) => { const k = th.getAttribute("data-key"); if(k) keyToIndex[k] = idx; });
    for(const [k, v] of Object.entries(payload)){
      const idx = keyToIndex[k];
      if (typeof idx === "number"){
        const td = tr.children[idx];
        if(td){
          const input = td.querySelector('input.cell-input');
          const value = (k === 'fecha_elaboracion') ? toDateOnly(v) : (v ?? "");
          if(input){ input.value = value; input.defaultValue = input.value; }
          else td.textContent = value.toString();
        }
      }
    }
    try{
      const rowObj = JSON.parse(decodeURIComponent(tr.getAttribute("data-row")));
      Object.assign(rowObj, payload);
      tr.setAttribute("data-row", encodeURIComponent(JSON.stringify(rowObj)));
    }catch{}
    dt.row(tr).invalidate().draw(false);
  }

  function enableColumnResize(){
    const table = document.getElementById("tabla");
    const headerRow = document.getElementById("thead-titles");
    let startX = 0, startWidth = 0, targetTh = null, colIndex = -1;

    function onMouseDown(e){
      const handle = e.target.closest(".resizer"); if(!handle) return;
      targetTh = handle.parentElement;
      colIndex = Array.from(headerRow.children).indexOf(targetTh) + 1;
      startX = e.clientX; startWidth = targetTh.offsetWidth;
      document.body.classList.add("resizing");
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    }
    function onMouseMove(e){
      if(!targetTh) return;
      const dx = e.clientX - startX;
      const newW = Math.max(80, startWidth + dx);
      targetTh.style.width = newW + "px";
      table.querySelectorAll(`tbody tr td:nth-child(${colIndex})`).forEach(td=>{ td.style.width = newW + "px"; });
    }
    function onMouseUp(){
      document.body.classList.remove("resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      targetTh = null;
    }
    headerRow.addEventListener("mousedown", onMouseDown);
  }

  const $backdrop = document.getElementById("modalBackdrop");
  const $btnClose = document.getElementById("btnCloseModal");
  const $btnCancel = document.getElementById("btnCancel");
  const $btnSave = document.getElementById("btnSave");
  const $btnEdit = document.getElementById("btnEdit");
  const $kvGrid = document.getElementById("kvGrid");
  const $saveHint = document.getElementById("saveHint");
  const $modalSubtitle = document.getElementById("modalSubtitle");
  const $modalIdBadge = document.getElementById("modalIdBadge");

  let _currentId = null;
  let _initialValues = null;
  let _editMode = false;

  function showModal(){ $backdrop.classList.add("show"); $backdrop.setAttribute("aria-hidden","false"); }
  function hideModal(){ $backdrop.classList.remove("show"); $backdrop.setAttribute("aria-hidden","true"); }

  [$btnClose, $btnCancel].forEach(b => b.addEventListener("click", ()=>{
    _editMode = false;
    if(_initialValues) renderGridFromValues(_initialValues, true);
    setEditUIState(false);
    hideModal();
  }));
  $backdrop.addEventListener("click", (e)=>{ if(e.target === $backdrop) { _editMode=false; setEditUIState(false); hideModal(); } });

  function inputHTML(col, value){
    const safe = v => (v ?? "").toString();
    if(col.type === "date"){
      return `<input class="kv-input" type="date" data-field="${col.key}" value="${toDateOnly(value)}">`;
    }
    return `<input class="kv-input" type="text" data-field="${col.key}" value="${safe(value).replace(/"/g,'&quot;')}">`;
  }
  function viewHTML(value){
    const val = (value == null || value === "") ? "<span class='tag'>(vacío)</span>" : String(value);
    return `<div class="kv-value">${val}</div>`;
  }
  function renderGridFromValues(values, readOnly){
    const items = detailColumns.map(col=>{
      const raw = values[col.key];
      const v = (col.type === "date") ? toDateOnly(raw) : raw;
      const content = readOnly ? viewHTML(v) : inputHTML(col, v);
      return `<div class="kv-item"><div class="kv-label">${col.title}</div><div class="kv-value-wrap">${content}</div></div>`;
    }).join("");
    $kvGrid.innerHTML = items;
  }
  function setEditUIState(on){
    _editMode = on;
    $btnSave.disabled = !on;
    $btnEdit.textContent = on ? "Siguiendo en edición…" : "Editar";
    $saveHint.textContent = on ? "Edita y luego presiona Guardar. Cancelar revierte los cambios." : "Vista de solo lectura. Presiona Editar para modificar campos.";
  }

  async function openDetailModal(id){
    let row = id ? _rowsCache.get(id) : null;
    if(!row){
      const tr = document.querySelector(`tr[data-id="${id}"]`) || document.querySelector(`button[data-action='ver'][data-id="${id}"]`)?.closest("tr");
      if(tr){ try { row = JSON.parse(decodeURIComponent(tr.getAttribute("data-row"))); } catch{} }
    }
    if(!row && id){ row = await fetchRowById(id); }
    if(!row){ alert("No se pudo cargar el registro. Verifica PRIMARY_KEY."); return; }

    _currentId = row[PRIMARY_KEY] ?? null;
    _initialValues = {}; detailColumns.forEach(c => _initialValues[c.key] = (row[c.key] ?? null));

    document.getElementById("modalTitle").textContent = "Detalle del predio";
    $modalSubtitle.textContent = (row.comunidad ? `Comunidad: ${row.comunidad} · ` : "") + (row.codigo_preliminar ? `Código: ${row.codigo_preliminar}` : "");
    $modalIdBadge.textContent = row[PRIMARY_KEY] ?? "(sin PK)";

    renderGridFromValues(_initialValues, true);
    setEditUIState(false);
    showModal();
  }

  $btnEdit.addEventListener("click", ()=>{
    if(!_initialValues) return;
    renderGridFromValues(_initialValues, false);
    setEditUIState(true);
  });

  $btnSave.addEventListener("click", async ()=>{
    if(!_currentId){ $saveHint.textContent = "⚠️ Falta PRIMARY_KEY."; return; }
    const payload = {};
    detailColumns.forEach(col=>{
      const el = $kvGrid.querySelector(`[data-field="${col.key}"]`);
      if(!el) return;
      let v = el.value;
      if(col.type === "date" && !v) v = null;
      const prev = _initialValues[col.key] ?? null;
      if(col.type === "date"){
        if(toDateOnly(prev) !== (v ?? "")) payload[col.key] = v;
      } else {
        if((prev ?? "") !== (v ?? "")) payload[col.key] = v;
      }
    });
    if(Object.keys(payload).length === 0){ $saveHint.textContent = "No hay cambios para guardar."; return; }
    $saveHint.textContent = "Guardando…";
    try{
      await updateRow(_currentId, payload);
      Object.assign(_initialValues, payload);
      renderGridFromValues(_initialValues, true);
      setEditUIState(false);
      $saveHint.textContent = "Cambios guardados.";
      updateRowInTable(_currentId, payload);
      setTimeout(()=>{ hideModal(); }, 350);
    }catch(err){
      console.error(err);
      $saveHint.textContent = "Error al guardar. " + (err?.message || "");
      $saveHint.style.color = "var(--danger)"; setTimeout(()=>{ $saveHint.style.color=""; }, 2000);
    }
  });

  // ===== Exportar =====
  const $exportBackdrop = document.getElementById("exportBackdrop");
  const $btnExport = document.getElementById("btnExport");
  const $btnCloseExport = document.getElementById("btnCloseExport");
  const $exCom = document.getElementById("ex_comunidad");
  const $exEnt = document.getElementById("ex_entregable");
  const $exRes = document.getElementById("ex_responsable");
  const $btnExportXLSX = document.getElementById("btnExportXLSX");
  const $btnExportCSV = document.getElementById("btnExportCSV");

  function showExport(){ $exportBackdrop.classList.add("show"); $exportBackdrop.setAttribute("aria-hidden","false"); }
  function hideExport(){ $exportBackdrop.classList.remove("show"); $exportBackdrop.setAttribute("aria-hidden","true"); }

  const titleByKey = (() => {
    const map = { [PRIMARY_KEY]: "ID" };
    detailColumns.forEach(c => map[c.key] = c.title);
    return map;
  })();

  function buildExportColumnsUI(){
    const box = document.getElementById("ex_cols");
    const keys = [PRIMARY_KEY, ...detailColumns.map(c=>c.key)];
    box.innerHTML = keys.map(k => `
      <label><input type="checkbox" class="ex-col" data-key="${k}" checked> ${titleByKey[k] || k}</label>
    `).join("");

    const selAll = document.getElementById("ex_select_all");
    selAll.checked = true;
    selAll.onchange = () => {
      box.querySelectorAll(".ex-col").forEach(cb => cb.checked = selAll.checked);
    };
    box.addEventListener("change", (e)=>{
      if(!e.target.classList.contains("ex-col")) return;
      const all = box.querySelectorAll(".ex-col");
      const checked = box.querySelectorAll(".ex-col:checked");
      selAll.checked = (all.length === checked.length);
    });
  }

  function getSelectedExportKeys(){
    const box = document.getElementById("ex_cols");
    const cbs = Array.from(box.querySelectorAll(".ex-col:checked"));
    const first = cbs.find(cb => cb.dataset.key === PRIMARY_KEY);
    const rest  = cbs.filter(cb => cb.dataset.key !== PRIMARY_KEY);
    const arr = [];
    if(first) arr.push(first.dataset.key);
    rest.forEach(cb => arr.push(cb.dataset.key));
    if(arr.length === 0) arr.push(PRIMARY_KEY);
    return arr;
  }

  function applyExportFilters(rows){
    const c = $exCom.value, e = $exEnt.value, r = $exRes.value;
    return rows.filter(row =>
      (!c || (row.comunidad ?? "")===c) &&
      (!e || (row.entregable ?? "")===e) &&
      (!r || (row.responsable_tecnico ?? "")===r)
    );
  }

  function rowsToSheetData(rows, colKeys){
    return rows.map(r=>{
      const obj = {};
      colKeys.forEach(k=>{
        let v = r[k];
        if(k === "fecha_elaboracion") v = toDateOnly(v);
        if(typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) v = v.slice(0,10);
        obj[ titleByKey[k] || k ] = (v ?? "");
      });
      return obj;
    });
  }

  $btnExport.addEventListener("click", ()=>{
    const fill = (key, selEl, mapFn)=>{
      const opts = [...new Set(_allRows.map(r => {
        const v = (r[key] ?? "");
        return mapFn ? mapFn(v) : v.toString();
      }).filter(v => v.trim() !== ""))]
        .sort((a,b)=>a.localeCompare(b));
      selEl.innerHTML = `<option value="">(Todos)</option>` + opts.map(v=>`<option value="${v}">${v}</option>`).join("");
    };
    fill("comunidad", $exCom);
    fill("entregable", $exEnt);
    fill("responsable_tecnico", $exRes);
    buildExportColumnsUI();
    showExport();
  });

  [$btnCloseExport, $exportBackdrop].forEach(el=>{
    el.addEventListener("click", (e)=>{ if(e.target===el || e.target===$btnCloseExport) hideExport(); });
  });

  document.getElementById("btnExportXLSX").addEventListener("click", ()=>{
    const rows = applyExportFilters(_allRows);
    const cols = getSelectedExportKeys();
    const data = rowsToSheetData(rows, cols);
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "predios");
    XLSX.writeFile(wb, "predios_export.xlsx"); hideExport();
  });

  document.getElementById("btnExportCSV").addEventListener("click", ()=>{
    const rows = applyExportFilters(_allRows);
    const cols = getSelectedExportKeys();
    const data = rowsToSheetData(rows, cols);
    const ws = XLSX.utils.json_to_sheet(data);
    // Si prefieres separador ; cambia FS: ";"
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ",", strip: true });
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "predios_export.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    hideExport();
  });

  (async () => {
    buildThead();
    const rows = await fetchAllRows();
    fillTbody(rows);
    initDataTableAndExternalFilters(rows);
  })();
