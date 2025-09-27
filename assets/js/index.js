const PAGES = {
  avance: 'index_avance2.html',
  predios: 'index_predios2.html',
  predios_avance: 'index_predios_avance.html',
  predios_verificador: 'index_predios_verificador.html',
  resumen: 'index_resumen.html'
};

const viewer = document.getElementById('viewer');
const frame = document.getElementById('frame');
const openNew = document.getElementById('openNew');
const viewerTitle = document.getElementById('viewerTitle');

function loadHere(key){
  const url = PAGES[key];
  if(!url){
    alert('Ruta no encontrada. Ajusta PAGES.');
    return;
  }
  frame.src = url;
  openNew.href = url;
  viewerTitle.textContent =
    key === 'avance' ? 'Avance (Planificado vs Elaborado)'
    : key === 'predios' ? 'Predios — Edición & Filtros'
    : key === 'predios_avance' ? 'Predios — Avance (códigos + avance)'
    : key === 'predios_verificador' ? 'Predios — Verificador'
    : 'Resumen';
  viewer.style.display = 'block';
  frame.focus();
}
window.loadHere = loadHere;

function closeViewer(){
  frame.src = 'about:blank';
  viewer.style.display = 'none';
}
window.closeViewer = closeViewer;

const SUPABASE_URL = "https://wbzxbfqowlfmmkwqeyam.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndienhiZnFvd2xmbW1rd3FleWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5ODUwMDQsImV4cCI6MjA3MjU2MTAwNH0.mJJ7yID73tUerWE_aiNw3ZE4o-Q9YrT39YN-iS2CksA";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusConn = document.getElementById('statusConn');
const countPredios = document.getElementById('countPredios');
const lastDate = document.getElementById('lastDate');

(async function quickStatus(){
  try{
    const { count, error: e1 } = await sb.from('predios').select('id', { count:'exact', head:true });
    if(e1) throw e1;
    countPredios.textContent = `Predios: ${count ?? '—'}`;

    const { data: last, error: e2 } = await sb.from('predios')
      .select('fecha_elaboracion')
      .order('fecha_elaboracion', { ascending:false })
      .limit(1);
    if(e2) throw e2;
    const d = last && last[0] && last[0].fecha_elaboracion
      ? String(last[0].fecha_elaboracion).slice(0, 10)
      : '—';
    lastDate.textContent = `Último elaborado: ${d}`;

    statusConn.textContent = 'Conexión: OK';
    statusConn.style.borderColor = 'transparent';
    statusConn.classList.add('ok');
  }catch(err){
    statusConn.textContent = 'Conexión: ERROR';
    statusConn.classList.add('bad');
    console.error(err);
  }
})();
