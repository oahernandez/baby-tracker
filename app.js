// Bebé Tracker - App principal
// Datos en IndexedDB (offline). Exportable a CSV.

const DB_NAME = 'baby-tracker';
const DB_VERSION = 1;
const STORE = 'events';

// --- Utilidades de fechas ---
function pad(n){return n.toString().padStart(2,'0')}

function toLocalDateString(d){
  // YYYY-MM-DD en zona local
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function toLocalDatetimeValue(d){
  // datetime-local: YYYY-MM-DDTHH:mm
  return `${toLocalDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeValue(s){
  // Convierte 'YYYY-MM-DDTHH:mm' a Date en zona local
  if(!s) return null;
  const [date, time] = s.split('T');
  const [y,m,dd] = date.split('-').map(Number);
  const [hh,mm] = time.split(':').map(Number);
  return new Date(y, m-1, dd, hh, mm, 0, 0);
}

function msToHhmm(ms){
  if(ms == null) return '—';
  const totalMin = Math.round(ms/60000);
  const h = Math.floor(totalMin/60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

// --- IndexedDB helper ---
function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by_date', 'date', { unique: false });
        store.createIndex('by_type', 'tipo', { unique: false });
        store.createIndex('by_start', 'inicio', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

function genId(){
  return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}

// CRUD
async function addEvent(ev){
  ev.id = ev.id || genId();
  return withStore('readwrite', store => store.put(ev));
}

async function getEventsByDate(dateStr){
  return withStore('readonly', store => {
    return new Promise((resolve, reject) => {
      const idx = store.index('by_date');
      const range = IDBKeyRange.only(dateStr);
      const req = idx.getAll(range);
      req.onsuccess = () => {
        const arr = req.result || [];
        arr.sort((a,b) => (a.inicio||'').localeCompare(b.inicio||''));
        resolve(arr);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function getAllEvents(){
  return withStore('readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const arr = req.result || [];
        arr.sort((a,b) => (a.inicio||'').localeCompare(b.inicio||''));
        resolve(arr);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function deleteEvent(id){
  return withStore('readwrite', store => store.delete(id));
}

// --- UI ---
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const datePicker = $('#datePicker');
const btnHoy = $('#btnHoy');
const btnExport = $('#btnExport');
const form = $('#eventForm');
const resumen = $('#resumen');
const tableBody = $('#tablaEventos tbody');
const emptyMsg = $('#emptyMsg');

const inputId = $('#eventId');
const selectTipo = $('#tipo');
const inputInicio = $('#inicio');
const inputFin = $('#fin');
const selectModo = $('#modo');
const selectLado = $('#lado');
const inputVolumen = $('#volumen');
const inputActividad = $('#actividad');
const inputNotasBano = $('#notasBano');
const inputNotas = $('#notas');

function setToday(){
  const now = new Date();
  datePicker.value = toLocalDateString(now);
  inputInicio.value = toLocalDatetimeValue(now);
  inputFin.value = '';
}

function updateConditionalFields(){
  const tipo = selectTipo.value;
  const modo = selectModo.value;
  $$('.conditional').forEach(el => {
    const onlyFor = el.getAttribute('data-for');
    const when = el.getAttribute('data-when');
    let show = true;
    if(onlyFor && onlyFor !== tipo) show = false;
    if(show && when){
      // when can be 'pecho' or 'biberon|jeringa'
      const parts = when.split('|');
      show = parts.includes(modo);
    }
    el.style.display = show ? '' : 'none';
  });
}

function resetForm(){
  inputId.value = '';
  selectTipo.value = 'lactancia';
  selectModo.value = 'pecho';
  selectLado.value = '';
  inputVolumen.value = '';
  inputActividad.value = '';
  inputNotasBano.value = '';
  inputNotas.value = '';
  setToday();
  updateConditionalFields();
}

function eventToRow(ev){
  const tr = document.createElement('tr');
  const detalleParts = [];

  if(ev.tipo === 'lactancia'){
    detalleParts.push(`<span class="tag">${ev.modo||''}</span>`);
    if(ev.modo === 'pecho' && ev.lado) detalleParts.push(`<span class="tag">${ev.lado}</span>`);
    if((ev.modo === 'biberon' || ev.modo === 'jeringa') && ev.volumen){
      detalleParts.push(`<span class="tag">${ev.volumen} ml</span>`);
    }
  }
  if(ev.tipo === 'juego' && ev.actividad){
    detalleParts.push(`<span class="tag">${ev.actividad}</span>`);
  }
  if(ev.tipo === 'bano' && ev.notasBano){
    detalleParts.push(`<span class="tag">${ev.notasBano}</span>`);
  }
  if(ev.notas){
    detalleParts.push(`<span class="tag">${ev.notas}</span>`);
  }

  const inicio = ev.inicio ? new Date(ev.inicio) : null;
  const fin = ev.fin ? new Date(ev.fin) : null;
  const dur = (inicio && fin) ? (fin - inicio) : null;

  tr.innerHTML = `
    <td>${ev.tipo}</td>
    <td>${inicio ? inicio.toLocaleString() : '—'}</td>
    <td>${fin ? fin.toLocaleString() : '—'}</td>
    <td>${detalleParts.join(' ')}</td>
    <td>${msToHhmm(dur)}</td>
    <td>
      <button class="btn outline btn-edit" data-id="${ev.id}">Editar</button>
      <button class="btn outline btn-del" data-id="${ev.id}">Borrar</button>
    </td>
  `;
  return tr;
}

function calcResumenDelDia(events){
  const out = {
    lactanciaMs: 0,
    lactanciaIzq: 0,
    lactanciaDer: 0,
    lactanciaMl: 0,
    suenoMs: 0,
    juegoMs: 0,
    banos: 0
  };
  for(const ev of events){
    const inicio = ev.inicio ? new Date(ev.inicio) : null;
    const fin = ev.fin ? new Date(ev.fin) : null;
    const dur = (inicio && fin) ? (fin - inicio) : 0;
    switch(ev.tipo){
      case 'lactancia':
        if(ev.modo === 'pecho') {
          out.lactanciaMs += dur;
          if(ev.lado === 'izquierda') out.lactanciaIzq++;
          if(ev.lado === 'derecha') out.lactanciaDer++;
        } else {
          // biberon o jeringa
          if(ev.volumen) out.lactanciaMl += Number(ev.volumen)||0;
        }
        break;
      case 'sueno': out.suenoMs += dur; break;
      case 'juego': out.juegoMs += dur; break;
      case 'bano': out.banos += 1; break;
    }
  }
  return out;
}

function renderResumen(events){
  const r = calcResumenDelDia(events);
  resumen.innerHTML = `
    <div class="stat">
      <h3>Lactancia (pecho)</h3>
      <p>${msToHhmm(r.lactanciaMs)} · izq: ${r.lactanciaIzq} · der: ${r.lactanciaDer}</p>
    </div>
    <div class="stat">
      <h3>Leche (biberón/jeringa)</h3>
      <p>${r.lactanciaMl} ml</p>
    </div>
    <div class="stat">
      <h3>Sueño</h3>
      <p>${msToHhmm(r.suenoMs)}</p>
    </div>
    <div class="stat">
      <h3>Juego</h3>
      <p>${msToHhmm(r.juegoMs)}</p>
    </div>
    <div class="stat">
      <h3>Baños</h3>
      <p>${r.banos}</p>
    </div>
  `;
}

async function refreshList(){
  const day = datePicker.value;
  const events = await getEventsByDate(day);
  tableBody.innerHTML = '';
  if(!events.length){
    emptyMsg.style.display = '';
  } else {
    emptyMsg.style.display = 'none';
  }
  for(const ev of events){
    tableBody.appendChild(eventToRow(ev));
  }
  renderResumen(events);
}

async function onSubmit(ev){
  ev.preventDefault();
  const id = inputId.value || null;
  const tipo = selectTipo.value;
  const date = datePicker.value;
  const inicio = fromLocalDatetimeValue(inputInicio.value);
  const fin = fromLocalDatetimeValue(inputFin.value);

  const payload = {
    id,
    tipo,
    date, // clave de búsqueda
    inicio: inicio ? inicio.toISOString() : null,
    fin: fin ? fin.toISOString() : null,
    modo: (tipo === 'lactancia') ? selectModo.value : undefined,
    lado: (tipo === 'lactancia' && selectModo.value === 'pecho') ? selectLado.value : undefined,
    volumen: (tipo === 'lactancia' && (selectModo.value === 'biberon' || selectModo.value === 'jeringa')) ? (inputVolumen.value ? Number(inputVolumen.value) : undefined) : undefined,
    actividad: (tipo === 'juego') ? (inputActividad.value || undefined) : undefined,
    notasBano: (tipo === 'bano') ? (inputNotasBano.value || undefined) : undefined,
    notas: inputNotas.value || undefined
  };

  // Validación básica
  if(payload.fin && payload.inicio && new Date(payload.fin) < new Date(payload.inicio)){
    alert('El fin no puede ser antes del inicio.');
    return;
  }
  if(tipo === 'lactancia' && payload.modo === 'pecho' && !payload.lado){
    if(!confirm('No seleccionaste lado. ¿Guardar de todas formas?')) return;
  }

  await addEvent(payload);
  resetForm();
  await refreshList();
}

function onTableClick(e){
  const btn = e.target.closest('button');
  if(!btn) return;
  const id = btn.getAttribute('data-id');
  if(btn.classList.contains('btn-del')){
    if(confirm('¿Borrar este evento?')){
      deleteEvent(id).then(refreshList);
    }
  }
  if(btn.classList.contains('btn-edit')){
    // Cargar datos al formulario
    withStore('readonly', store => store.get(id)).then(record => {
      if(!record) return;
      inputId.value = record.id;
      selectTipo.value = record.tipo;
      datePicker.value = record.date;
      inputInicio.value = record.inicio ? toLocalDatetimeValue(new Date(record.inicio)) : '';
      inputFin.value = record.fin ? toLocalDatetimeValue(new Date(record.fin)) : '';
      selectModo.value = record.modo || 'pecho';
      selectLado.value = record.lado || '';
      inputVolumen.value = (record.volumen != null) ? record.volumen : '';
      inputActividad.value = record.actividad || '';
      inputNotasBano.value = record.notasBano || '';
      inputNotas.value = record.notas || '';
      updateConditionalFields();
      window.scrollTo({top:0,behavior:'smooth'});
    });
  }
}

async function exportCSV(){
  const rows = await getAllEvents();
  const headers = ['id','tipo','date','inicio','fin','modo','lado','volumen','actividad','notasBano','notas'];
  const escape = (v) => {
    if(v==null) return '';
    const s = String(v).replace(/"/g,'""');
    return `"${s}"`;
  };
  const lines = [headers.join(',')];
  for(const r of rows){
    lines.push(headers.map(h => escape(r[h])).join(','));
  }
  const csv = lines.join('\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bebe-tracker.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// --- Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  resetForm();
  refreshList();
  if('serviceWorker' in navigator){
    fetch('sw.js') // verifica que existe antes de registrar
      .then(() => navigator.serviceWorker.register('sw.js'))
      .catch(()=>{});
  }
});

selectTipo.addEventListener('change', updateConditionalFields);
selectModo.addEventListener('change', updateConditionalFields);

btnHoy.addEventListener('click', (e)=>{e.preventDefault(); setToday(); refreshList();});
btnExport.addEventListener('click', (e)=>{e.preventDefault(); exportCSV();});
form.addEventListener('submit', onSubmit);
$('#btnLimpiar').addEventListener('click', (e)=>{e.preventDefault(); resetForm();});

datePicker.addEventListener('change', refreshList);

document.querySelector('#tablaEventos').addEventListener('click', onTableClick);
