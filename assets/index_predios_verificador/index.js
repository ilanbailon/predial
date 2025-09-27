/* ===== Supabase ===== */
  const SUPABASE_URL = "https://wbzxbfqowlfmmkwqeyam.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndienhiZnFvd2xmbW1rd3FleWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODUwMDQsImV4cCI6MjA3MjU2MTAwNH0.mJJ7yID73tUerWE_aiNw3ZE4o-Q9YrT39YN-iS2CksA";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'public' } });

  /* ===== Helpers decimales ===== */
  const isNum = v => Number.isFinite(Number(v));
  const fix2 = v => { const x=Number(v); return Number.isFinite(x) ? Number(x.toFixed(2)) : null; };
  const fix4 = v => { const x=Number(v); return Number.isFinite(x) ? Number(x.toFixed(4)) : null; };
  const fmt2 = v => { const x=Number(v); return Number.isFinite(x) ? x.toFixed(2) : ''; };
  const fmt4 = v => { const x=Number(v); return Number.isFinite(x) ? x.toFixed(4) : ''; };
  const ha4 = v => { const x=Number(v); return Number.isFinite(x) ? Number((x/10000).toFixed(4)) : null; };

  /* ===== Estado / UI refs ===== */
  let dt, allPredios = [], codPredByMtc = new Map();
  const $tbody = document.getElementById('tbody');
  const $msg = document.getElementById('msg');
  const $loading = document.getElementById('loading');
  const $loadingText = document.getElementById('loadingText');
  const $loadingSub = document.getElementById('loadingSub');

  const columns = [
    { key:'id',                   title:'ID', hidden:false },
    { key:'comunidad',            title:'Comunidad', hidden:false },
    { key:'codigo_preliminar',    title:'Código', hidden:false },
    { key:'codigo_mtc',           title:'Código MTC', hidden:false },
    { key:'nombre_razon_social',  title:'Nombre / Razón Social', hidden:false }, // editable inline
    { key:'condicion_juridica',   title:'Condición Jurídica', hidden:false },
    { key:'areas',                title:'Áreas (cod_prel)', hidden:false },
    { key:'acciones',             title:'Acciones', hidden:false },
    // ocultas para filtros externos:
    { key:'entregable',           title:'Entregable', hidden:true },
    { key:'responsable_tecnico',  title:'Responsable', hidden:true },
    { key:'fecha_elaboracion',    title:'Fecha elab.', hidden:true },
  ];
  const idxOf = k => columns.findIndex(c => c.key === k);
  const toDateOnly = v => (!v? '' : v.toString().slice(0,10));
  const safeLike = s => (s||"").toString().replace(/[%_]/g, m => '\\' + m);

  const setMsg = t => $msg.textContent = t || '';
  function showLoading(text='Procesando…', sub=''){ $loadingText.textContent=text; $loadingSub.textContent=sub||''; $loading.classList.add('show'); }
  function hideLoading(){ $loading.classList.remove('show'); }

  function buildThead(){
    const ths = columns.map(c => `<th data-key="${c.key}" class="${c.hidden?'col-hidden':''}">${c.title}</th>`).join('');
    document.getElementById('thead-titles').innerHTML = ths;
  }

  /* ===== Datos ===== */
  async function loadPredios(){
    const page=1000; let from=0, out=[];
    while(true){
      let q = sb.from('predios')
        .select('id, comunidad, codigo_preliminar, codigo_mtc, nombre_razon_social, condicion_juridica, fecha_elaboracion, entregable, responsable_tecnico')
        .order('id', { ascending:true })
        .range(from, from+page-1);
      q = q.not('codigo_mtc','is', null).neq('codigo_mtc','-').neq('codigo_mtc','');
      const { data, error } = await q;
      if(error){ console.error(error); break; }
      out = out.concat(data||[]);
      if(!data || data.length < page) break;
      from += page;
    }
    allPredios = out;
  }

  async function loadAllCodPred(){
    const page=2000; let from=0, map = new Map();
    while(true){
      const { data, error } = await sb.from('cod_pred')
        .select('id,cod_prel,codigo_mtc,area,area_hec,matriz,matriz_hec,perimetro_suma,prog_ini,prog_fin,lado')
        .order('id', { ascending:true })
        .range(from, from+page-1);
      if(error){ console.error(error); break; }
      (data||[]).forEach(r=>{
        const key = (r.codigo_mtc||'').toString();
        if(!map.has(key)) map.set(key, []);
        map.get(key).push(r);
      });
      if(!data || data.length < page) break;
      from += page;
    }
    codPredByMtc = map;
  }

  /* ===== Render tabla ===== */
  function buildChips(codigo_mtc){
    if(!codigo_mtc) return '';
    const list = (codPredByMtc.get(codigo_mtc) || []).sort((a,b)=> (a.cod_prel||'').localeCompare(b.cod_prel||''));
    return list.map(item => `<span class="chip" data-cpid="${item.id}" title="Editar">${item.cod_prel ?? '(sin cod_prel)'}</span>`).join('');
  }
  function trHTML(r){
    const chips = buildChips(r.codigo_mtc);
    const tds = columns.map(col=>{
      if(col.key==='areas'){
        return `<td>${chips || '<span class="tag">(sin áreas)</span>'}</td>`;
      }
      if(col.key==='acciones'){
        return `<td><button class="btn small" data-action="areas" data-id="${r.id}">Agregar áreas</button></td>`;
      }
      let val = r[col.key];
      if(col.key==='fecha_elaboracion') val = toDateOnly(val);
      return `<td class="${col.hidden?'col-hidden':''}">${(val ?? '').toString()}</td>`;
    }).join('');
    return `<tr data-id="${r.id}" data-mtc="${r.codigo_mtc||''}">${tds}</tr>`;
  }
  function fillTbody(rows){ document.getElementById('tbody').innerHTML = rows.map(trHTML).join(''); }

  /* ===== DataTables + filtros externos ===== */
  function initDataTableAndFilters(){
    if(dt) dt.destroy();
    dt = new DataTable("#tabla", {
      pageLength: 250,
      lengthMenu: [[25,50,100,250,-1],[25,50,100,250,"Todos"]],
      lengthChange: true,
      ordering: true,
      searching: true,
      columnDefs: [
        { targets: columns.map((c,i)=> c.hidden? i : -1).filter(x=>x>=0), visible:false, searchable:true }
      ]
    });

    const fillUnique = (key, selId, mapFn) => {
      const set = new Set();
      allPredios.forEach(r=>{
        let v = r[key] ?? ''; if(mapFn) v = mapFn(v); v = (v??'').toString().trim();
        if(v) set.add(v);
      });
      const arr = [...set].sort((a,b)=>a.localeCompare(b));
      const sel = document.getElementById(selId);
      sel.innerHTML = `<option value="">(Todos)</option>` + arr.map(v=>`<option value="${v}">${v}</option>`).join('');
    };
    fillUnique('comunidad','f_comunidad');
    fillUnique('entregable','f_entregable');
    fillUnique('responsable_tecnico','f_responsable');
    fillUnique('fecha_elaboracion','f_fecha', toDateOnly);

    const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const applyFilters = ()=>{
      const c = document.getElementById('f_comunidad').value;
      const e = document.getElementById('f_entregable').value;
      const r = document.getElementById('f_responsable').value;
      const f = document.getElementById('f_fecha').value;

      const ixC = idxOf('comunidad'), ixE = idxOf('entregable'), ixR = idxOf('responsable_tecnico'), ixF = idxOf('fecha_elaboracion');
      if(ixC>=0) dt.column(ixC).search(c ? '^'+escapeRx(c)+'$' : '', true, false);
      if(ixE>=0) dt.column(ixE).search(e ? '^'+escapeRx(e)+'$' : '', true, false);
      if(ixR>=0) dt.column(ixR).search(r ? '^'+escapeRx(r)+'$' : '', true, false);
      if(ixF>=0) dt.column(ixF).search(f ? '^'+escapeRx(f)+'$' : '', true, false);
      dt.draw();
    };
    ['f_comunidad','f_entregable','f_responsable','f_fecha'].forEach(id=>{
      document.getElementById(id).addEventListener('change', applyFilters);
    });
    document.getElementById('btnClear').addEventListener('click', ()=>{
      ['f_comunidad','f_entregable','f_responsable','f_fecha'].forEach(id=> document.getElementById(id).value='');
      applyFilters(); dt.search('').draw();
    });
  }

  /* ===== Export filtrado (con redondeo) ===== */
  function getFilteredRowIds(){
    const nodes = dt.rows({ search:'applied' }).nodes();
    const ids = []; nodes.each(function(tr){ ids.push(Number(tr.getAttribute('data-id'))); });
    return ids;
  }
  document.getElementById('btnExport').addEventListener('click', ()=>{
    showLoading('Generando Excel…', 'Usando vista filtrada');
    const ids = getFilteredRowIds();
    const mapById = new Map(allPredios.map(r=>[r.id, r]));
    const rows = ids.map(id=>{
      const p = mapById.get(id);
      const base = {
        id: p.id,
        comunidad: p.comunidad ?? '',
        codigo_preliminar: p.codigo_preliminar ?? '',
        codigo_mtc: p.codigo_mtc ?? '',
        nombre_razon_social: p.nombre_razon_social ?? '',
        condicion_juridica: p.condicion_juridica ?? '',
        entregable: p.entregable ?? '',
        responsable_tecnico: p.responsable_tecnico ?? ''
      };
      const items = (codPredByMtc.get(p.codigo_mtc||'') || []).sort((a,b)=> (a.cod_prel||'').localeCompare(b.cod_prel||''));
      items.forEach((it, i)=>{
        const n=i+1;
        base[`cod_prel_${n}`] = it.cod_prel ?? '';
        base[`area_${n}`] = fmt2(it.area);
        base[`area_hec_${n}`] = fmt4(it.area_hec ?? ha4(it.area));
        base[`matriz_${n}`] = fmt2(it.matriz);
        base[`matriz_hec_${n}`] = fmt4(it.matriz_hec ?? ha4(it.matriz));
        base[`perimetro_suma_${n}`] = fmt2(it.perimetro_suma);
        base[`prog_ini_${n}`] = it.prog_ini ?? '';
        base[`prog_fin_${n}`] = it.prog_fin ?? '';
        base[`lado_${n}`] = it.lado ?? '';
      });
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'predios_codpred_filtrado');
    XLSX.writeFile(wb, 'predios_codpred_filtrado.xlsx');
    hideLoading();
  });

  /* ===== Modal Áreas ===== */
  const $areasBack   = document.getElementById('areasBack');
  const $areasClose  = document.getElementById('areasClose');
  const $areasQ      = document.getElementById('areasQ');
  const $areasScope  = document.getElementById('areasScope');
  const $areasSearch = document.getElementById('areasSearch');
  const $areasMsg    = document.getElementById('areasMsg');
  const $areasList   = document.getElementById('areasList');
  const $areasAdd    = document.getElementById('areasAdd');
  const $mtcLbl      = document.getElementById('mtcLbl');
  const $predioLbl   = document.getElementById('predioLbl');

  let currentMTC = null, currentPredioId = null;

  function showAreas(){ $areasBack.classList.add('show'); }
  function hideAreas(){ $areasBack.classList.remove('show'); }

  async function openAreas(tr){
    const mtc = tr.getAttribute('data-mtc') || '';
    const id  = Number(tr.getAttribute('data-id'));
    if(!mtc){ alert('Este predio no tiene código MTC.'); return; }
    currentMTC = mtc; currentPredioId = id;
    $mtcLbl.textContent = mtc; $predioLbl.textContent = id;
    $areasQ.value=''; $areasScope.value='all'; $areasList.innerHTML=''; $areasMsg.textContent='';
    showAreas(); await searchAreas();
  }

  async function searchAreas(){
    $areasMsg.textContent = 'Cargando…';
    $areasSearch.disabled = true;
    let query = sb.from('cod_pred')
      .select('id,cod_prel,codigo_mtc,area,area_hec,matriz,matriz_hec,perimetro_suma,prog_ini,prog_fin,lado')
      .order('id', { ascending:true })
      .limit(1000);

    const scope = $areasScope.value;
    if(scope==='unassigned'){ query = query.is('codigo_mtc', null); }
    else if(scope==='current_or_unassigned'){ query = query.or(`codigo_mtc.is.null,codigo_mtc.eq.${currentMTC}`); }

    const q = $areasQ.value.trim();
    if(q){ query = query.ilike('cod_prel', `%${safeLike(q)}%`); }

    const { data, error } = await query;
    $areasSearch.disabled = false;
    if(error){ $areasMsg.textContent = error.message; return; }
    renderAreaCards(data||[]);
    $areasMsg.textContent = `Filas: ${(data||[]).length}`;
  }

  function inputKV(id, labelTxt, field, val, type, disabled=false){
    const v=(val??''); const typ=type||'text';
    const dis = disabled ? 'disabled' : '';
    return `<div class="kv"><label>${labelTxt}</label><input data-id="${id}" data-field="${field}" type="${typ}" value="${v}" ${dis}></div>`;
  }

  function renderAreaCards(rows){
    $areasList.innerHTML = rows.map(r=>{
      const a = fmt2(r.area);
      const ah = fmt4(r.area_hec ?? ha4(r.area));
      const m = fmt2(r.matriz);
      const mh = fmt4(r.matriz_hec ?? ha4(r.matriz));
      const per = fmt2(r.perimetro_suma);
      const badge = r.codigo_mtc
        ? `<span class="badge">MTC: ${r.codigo_mtc}</span>`
        : `<span class="badge" style="background:#fef2f2;color:#7f1d1d;border-color:#fee2e2">Sin asignar</span>`;
      return `
      <div class="area-card" data-id="${r.id}">
        <div class="area-head">
          <div class="area-head-left">
            <label style="display:inline-flex;gap:6px;align-items:center;">
              <input type="checkbox" data-id="${r.id}">
              <span class="code">${r.cod_prel ?? '(sin cod_prel)'}</span>
            </label>
          </div>
          ${badge}
        </div>
        <div class="area-body">
          <details>
            <summary>Ver / editar detalle</summary>
            <div class="grid">
              ${inputKV(r.id,'Prog. Inicial','prog_ini',r.prog_ini,'text')}
              ${inputKV(r.id,'Prog. Final','prog_fin',r.prog_fin,'text')}

              ${inputKV(r.id,'area (m²)','area',a,'number')}
              ${inputKV(r.id,'area_hec','area_hec',ah,'number',true)}

              ${inputKV(r.id,'matriz','matriz',m,'number')}
              ${inputKV(r.id,'matriz_hec','matriz_hec',mh,'number',true)}

              ${inputKV(r.id,'Lado','lado',r.lado,'text')}
              ${inputKV(r.id,'Perímetro suma','perimetro_suma',per,'number')}
            </div>
            <div style="margin-top:10px;display:flex;justify-content:flex-end">
              <button class="btn small" data-action="save-one" data-id="${r.id}">Guardar</button>
            </div>
          </details>
        </div>
      </div>`;
    }).join('');
  }

  // Auto-cálculo ha y normalización visual (sólo display; el redondeo real se hace al guardar)
  document.getElementById('areasList').addEventListener('input', (e)=>{
    const inp = e.target;
    if(!inp.matches('input[data-field="area"], input[data-field="matriz"]')) return;
    const card = inp.closest('.area-card'); if(!card) return;
    const id = inp.getAttribute('data-id');
    if(inp.dataset.field === 'area'){
      const out = card.querySelector(`input[data-field="area_hec"][data-id="${id}"]`);
      if(out) out.value = fmt4(ha4(inp.value));
    }else if(inp.dataset.field === 'matriz'){
      const out = card.querySelector(`input[data-field="matriz_hec"][data-id="${id}"]`);
      if(out) out.value = fmt4(ha4(inp.value));
    }
  });

  async function addSelectedAreas(){
    const ids = Array.from(document.querySelectorAll('#areasList input[type=checkbox][data-id]:checked')).map(el=>Number(el.dataset.id));
    if(ids.length===0){ alert('Selecciona al menos uno'); return; }

    showLoading('Asignando áreas…', `Seleccionados: ${ids.length}`);
    document.getElementById('areasAdd').disabled = true;

    // recolecta posibles ediciones
    const fields = ['prog_ini','prog_fin','area','area_hec','matriz','matriz_hec','lado','perimetro_suma'];
    const patches = new Map();
    document.querySelectorAll('#areasList input[data-id][data-field]').forEach(inp=>{
      const id = Number(inp.dataset.id), field = inp.dataset.field;
      if(!fields.includes(field)) return;
      let v = inp.value;
      if(inp.type==='number') v = (v===''? null : Number(v));
      if(inp.type!=='number' && v==='') v = null;
      const cur = patches.get(id) || {}; cur[field]=v; patches.set(id, cur);
    });

    // normaliza con redondeo
    for(const id of ids){
      const p = patches.get(id) || {};
      if(p.area != null) p.area = fix2(p.area);
      if(p.matriz != null) p.matriz = fix2(p.matriz);
      if(p.perimetro_suma != null) p.perimetro_suma = fix2(p.perimetro_suma);
      p.area_hec = (p.area==null ? null : ha4(p.area));
      p.matriz_hec = (p.matriz==null ? null : ha4(p.matriz));
      p.codigo_mtc = currentMTC;
      patches.set(id, p);
    }

    let ok=0, bad=0;
    for(const id of ids){
      const patch = patches.get(id) || { codigo_mtc: currentMTC };
      const { error } = await sb.from('cod_pred').update(patch).eq('id', id);
      if(error){ bad++; } else { ok++; }
      $loadingSub.textContent = `Progreso: ${ok+bad}/${ids.length}`;
    }
    if(bad>0){ alert(`Algunas filas fallaron: ${bad}`); }

    await loadAllCodPred();
    refreshRowForMTC(currentMTC);
    document.getElementById('areasAdd').disabled = false;
    hideLoading();
    hideAreas();
  }

  function cssEscape(s){ return (s||'').toString().replace(/["\\]/g,'\\$&'); }
  function refreshRowForMTC(codigoMtc){
    const tr = document.querySelector(`tr[data-mtc="${cssEscape(codigoMtc)}"]`);
    if(!tr) return;
    const tdAreas = tr.children[idxOf('areas')];
    if(tdAreas){ tdAreas.innerHTML = buildChips(codigoMtc) || '<span class="tag">(sin áreas)</span>'; }
    if(dt) dt.row(tr).invalidate().draw(false);
  }

  document.getElementById('areasClose').addEventListener('click', ()=>{ hideAreas(); });
  document.getElementById('areasSearch').addEventListener('click', searchAreas);
  document.getElementById('areasScope').addEventListener('change', searchAreas);
  document.getElementById('areasQ').addEventListener('keydown', e=>{ if(e.key==='Enter') searchAreas(); });
  document.getElementById('areasAdd').addEventListener('click', addSelectedAreas);

  // Guardar uno (detalle dentro de la tarjeta)
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-action="save-one"]');
    if(!btn) return;
    const id = Number(btn.getAttribute('data-id'));
    const card = btn.closest('.area-card'); if(!card) return;

    const inputs = card.querySelectorAll('input[data-id][data-field]');
    const patch = {};
    inputs.forEach(inp=>{
      if(Number(inp.dataset.id)!==id) return;
      let v = inp.value;
      if(inp.type==='number') v = (v===''? null : Number(v));
      if(inp.type!=='number' && v==='') v = null;
      patch[inp.dataset.field] = v;
    });
    // redondeo/derivados
    if(patch.area != null) patch.area = fix2(patch.area);
    if(patch.matriz != null) patch.matriz = fix2(patch.matriz);
    if(patch.perimetro_suma != null) patch.perimetro_suma = fix2(patch.perimetro_suma);
    patch.area_hec = (patch.area==null ? null : ha4(patch.area));
    patch.matriz_hec = (patch.matriz==null ? null : ha4(patch.matriz));

    showLoading('Guardando cambios…');
    btn.disabled = true;
    const { error } = await sb.from('cod_pred').update(patch).eq('id', id);
    btn.disabled = false;
    hideLoading();
    if(error){ alert('Error: '+error.message); return; }
    await loadAllCodPred();
    refreshRowForMTC(currentMTC);
    btn.textContent = 'Guardado ✓';
    setTimeout(()=>{ btn.textContent = 'Guardar'; }, 1200);
  });

  // Botón "Agregar áreas" en la tabla
  document.addEventListener('click', (e)=>{
    const btnAreas = e.target.closest('button[data-action="areas"]');
    if(btnAreas){
      const tr = btnAreas.closest('tr');
      openAreas(tr);
    }
  });

  /* ===== Modal editar chip ===== */
  const $editBack = document.getElementById('editBack');
  const $editClose = document.getElementById('editClose');
  const $editSave = document.getElementById('editSave');
  const $editCodP = document.getElementById('editCodP');
  const $editId = document.getElementById('editId');
  const $e_area = document.getElementById('e_area');
  const $e_area_hec = document.getElementById('e_area_hec');
  const $e_matriz = document.getElementById('e_matriz');
  const $e_matriz_hec = document.getElementById('e_matriz_hec');
  const $e_per = document.getElementById('e_per');
  const $e_ini = document.getElementById('e_ini');
  const $e_fin = document.getElementById('e_fin');
  const $e_lado = document.getElementById('e_lado');

  let editingCodPred = null;
  function showEdit(){ $editBack.classList.add('show'); }
  function hideEdit(){ $editBack.classList.remove('show'); }

  async function openEdit(id){
    showLoading('Leyendo detalle…');
    const { data, error } = await sb.from('cod_pred').select('*').eq('id', id).maybeSingle();
    hideLoading();
    if(error || !data){ alert('No se pudo leer.'); return; }
    editingCodPred = data;

    $editCodP.textContent = data.cod_prel ?? '';
    $editId.textContent = data.id;
    $e_ini.value = data.prog_ini ?? '';
    $e_fin.value = data.prog_fin ?? '';

    $e_area.value = fmt2(data.area);
    $e_area_hec.value = fmt4(data.area_hec ?? ha4(data.area));
    $e_matriz.value = fmt2(data.matriz);
    $e_matriz_hec.value = fmt4(data.matriz_hec ?? ha4(data.matriz));
    $e_per.value = fmt2(data.perimetro_suma);
    $e_lado.value = data.lado ?? '';
    showEdit();
  }

  function bindHAInputs(){
    $e_area.addEventListener('input', ()=>{ $e_area_hec.value = fmt4(ha4($e_area.value)); });
    $e_matriz.addEventListener('input', ()=>{ $e_matriz_hec.value = fmt4(ha4($e_matriz.value)); });
  }
  bindHAInputs();

  async function saveEdit(){
    if(!editingCodPred) return;
    const patch = {
      prog_ini: $e_ini.value || null,
      prog_fin: $e_fin.value || null,
      area: $e_area.value===''? null : fix2($e_area.value),
      matriz: $e_matriz.value===''? null : fix2($e_matriz.value),
      area_hec: $e_area.value===''? null : ha4($e_area.value),
      matriz_hec: $e_matriz.value===''? null : ha4($e_matriz.value),
      perimetro_suma: $e_per.value===''? null : fix2($e_per.value),
      lado: $e_lado.value || null,
    };
    showLoading('Guardando…');
    const { error } = await sb.from('cod_pred').update(patch).eq('id', editingCodPred.id);
    hideLoading();
    if(error){ alert(error.message); return; }
    await loadAllCodPred();
    if(editingCodPred.codigo_mtc){ refreshRowForMTC(editingCodPred.codigo_mtc); }
    hideEdit();
  }

  $editClose.addEventListener('click', hideEdit);
  $editSave.addEventListener('click', saveEdit);

  // abrir modal de chip
  document.addEventListener('click', (e)=>{
    const chip = e.target.closest('.chip');
    if(chip){
      const id = Number(chip.getAttribute('data-cpid'));
      openEdit(id);
    }
  });

  /* ===== Edición inline: nombre_razon_social ===== */
  const editableKey = 'nombre_razon_social';
  document.getElementById('tabla').addEventListener('dblclick', async (e)=>{
    const td = e.target.closest('td'); if(!td) return;
    const ths = Array.from(document.querySelectorAll('#thead-titles th'));
    const colIndex = Array.from(td.parentElement.children).indexOf(td);
    const key = ths[colIndex]?.getAttribute('data-key');
    if(key !== editableKey) return;
    if(td.querySelector('input.cell-input')) return;

    const tr = td.parentElement; const id = Number(tr.getAttribute('data-id'));
    const current = td.textContent;

    td.classList.add('cell-editing');
    td.innerHTML = `<input class="cell-input" value="${current.replace(/"/g,'&quot;')}">`;
    const inp = td.querySelector('input'); inp.focus(); inp.select();

    const save = async () => {
      const value = inp.value;
      if(value === current){ td.textContent = current; td.classList.remove('cell-editing'); return; }
      try{
        showLoading('Guardando…');
        const { error } = await sb.from('predios').update({ [editableKey]: value }).eq('id', id);
        hideLoading();
        if(error) throw error;
        const row = allPredios.find(r=>r.id===id);
        if(row) row[editableKey] = value;
        td.textContent = value;
      }catch(err){
        alert('Error: '+(err?.message||'')); td.textContent = current;
      }finally{
        td.classList.remove('cell-editing');
      }
    };
    inp.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter'){ inp.blur(); } if(ev.key==='Escape'){ td.textContent=current; td.classList.remove('cell-editing'); }});
    inp.addEventListener('blur', save);
  });

  /* ===== Init ===== */
  (async ()=>{
    buildThead();
    showLoading('Cargando datos…');
    await loadPredios();
    await loadAllCodPred();
    fillTbody(allPredios);
    initDataTableAndFilters();
    hideLoading();
    setMsg(`Filas: ${allPredios.length}`);
  })();
