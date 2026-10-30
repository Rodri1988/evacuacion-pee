// ==========================================
// Sistema de Evacuación y Conteo Rápido - PEE
// Versión con sincronización en tiempo real (Firebase)
// ==========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, onValue, set, update, remove, push, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const LOCAL_KEY = 'evac_local_v2';
const PEES = ['PEE_1', 'PEE_2', 'PEE_3', 'PEE_4'];

// Datos que solo viven en ESTE dispositivo
const local = { activePEE: 'PEE_1', sala: '' };

// Datos compartidos (vienen de Firebase)
let state = {
  expectedTotal: 150,
  counts: { PEE_1: 0, PEE_2: 0, PEE_3: 0, PEE_4: 0 },
  observaciones: [],
  alarmStart: null
};

let salaRef = null;
let unsubscribeSala = null;
let serverOffset = 0;
let connected = false;

// ---------- Datos locales (PEE activo y código de sala) ----------
function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    if (PEES.includes(saved.activePEE)) local.activePEE = saved.activePEE;
    if (typeof saved.sala === 'string') local.sala = saved.sala;
  } catch (e) {
    console.error('Error cargando datos locales:', e);
  }
}

function saveLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
}

// ---------- Utilidades ----------
function triggerHaptic() {
  if ('vibrate' in navigator) navigator.vibrate(40);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function normalizeSala(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function salaPath(sub) {
  return sub ? `salas/${local.sala}/${sub}` : `salas/${local.sala}`;
}

// ---------- Sala (código de brigada) ----------
function openSalaModal() {
  document.getElementById('salaInput').value = local.sala || '';
  document.getElementById('salaError').classList.add('hidden');
  document.getElementById('salaCancelBtn').classList.toggle('hidden', !local.sala);
  document.getElementById('salaModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('salaInput').focus(), 50);
}

function closeSalaModal() {
  document.getElementById('salaModal').classList.add('hidden');
}

function submitSala(e) {
  e.preventDefault();
  const code = normalizeSala(document.getElementById('salaInput').value);
  if (!/^[a-z0-9-]{4,40}$/.test(code)) {
    document.getElementById('salaError').classList.remove('hidden');
    return;
  }
  enterSala(code);
}

function enterSala(code) {
  if (unsubscribeSala) unsubscribeSala();

  local.sala = code;
  saveLocal();
  salaRef = ref(db, salaPath());

  unsubscribeSala = onValue(
    salaRef,
    snap => {
      applyRemote(snap.val() || {});
      renderUI();
    },
    err => {
      console.error('Error de sincronización:', err);
      updateSyncStatus('error');
    }
  );

  closeSalaModal();
  renderUI();
  updateSyncStatus();
}

function applyRemote(v) {
  const c = v.counts || {};
  state.counts = {
    PEE_1: Number(c.PEE_1) || 0,
    PEE_2: Number(c.PEE_2) || 0,
    PEE_3: Number(c.PEE_3) || 0,
    PEE_4: Number(c.PEE_4) || 0
  };
  state.expectedTotal = typeof v.expectedTotal === 'number' ? v.expectedTotal : 150;
  state.alarmStart = typeof v.alarmStart === 'number' ? v.alarmStart : null;
  state.observaciones = Object.entries(v.observaciones || {}).map(([id, o]) => ({
    id,
    nombre: String((o && o.nombre) || ''),
    status: o && o.status === 'encontrado' ? 'encontrado' : 'buscando',
    ts: (o && o.ts) || 0
  }));
}

function requireSala() {
  if (!salaRef) {
    openSalaModal();
    return false;
  }
  return true;
}

// ---------- Estado de conexión ----------
function updateSyncStatus(forced) {
  const dot = document.getElementById('syncStatusDot');
  const text = document.getElementById('syncStatusText');
  const base = 'w-2.5 h-2.5 rounded-full inline-block ';

  if (!local.sala) {
    dot.className = base + 'bg-yellow-400';
    text.innerText = 'Sin código de brigada';
  } else if (forced === 'error') {
    dot.className = base + 'bg-red-500';
    text.innerText = 'Error de acceso a la sala';
  } else if (connected) {
    dot.className = base + 'bg-green-400 animate-pulse';
    text.innerText = `Sala: ${local.sala} · En línea`;
  } else {
    dot.className = base + 'bg-red-500';
    text.innerText = 'SIN CONEXIÓN (no se sincroniza)';
  }
}

// ---------- Conteo ----------
function addCount(amount) {
  if (!requireSala()) return;
  triggerHaptic();
  // Transacción: suma segura aunque varias personas cuenten a la vez
  runTransaction(ref(db, salaPath(`counts/${local.activePEE}`)), cur =>
    Math.max(0, (Number(cur) || 0) + amount)
  ).catch(err => console.error('Error al contar:', err));
}

function changeActivePEE() {
  local.activePEE = document.getElementById('peeSelector').value;
  saveLocal();
  renderUI();
}

function resetCurrentPEE() {
  if (!requireSala()) return;
  if (confirm(`¿Reiniciar a cero el conteo del ${local.activePEE.replace('_', ' ')}? (Se reinicia para TODOS los dispositivos)`)) {
    set(ref(db, salaPath(`counts/${local.activePEE}`)), 0).catch(console.error);
  }
}

function editTotalExpected() {
  if (!requireSala()) return;
  const input = prompt('Ingrese la Dotación Total Esperada en Turno:', state.expectedTotal);
  if (input !== null) {
    const val = parseInt(input, 10);
    if (!isNaN(val) && val >= 0) {
      set(ref(db, salaPath('expectedTotal')), val).catch(console.error);
    }
  }
}

// ---------- Observaciones (personas que se buscan) ----------
function handleAddObservacion(e) {
  e.preventDefault();
  if (!requireSala()) return;
  const input = document.getElementById('inputNombre');
  const nombre = input.value.trim().slice(0, 100);
  if (!nombre) return;

  triggerHaptic();
  push(ref(db, salaPath('observaciones')), {
    nombre,
    status: 'buscando',
    ts: Date.now() + serverOffset
  }).catch(console.error);

  input.value = '';
}

function toggleObservacion(id) {
  if (!requireSala()) return;
  const item = state.observaciones.find(o => o.id === id);
  if (!item) return;
  triggerHaptic();
  update(ref(db, salaPath(`observaciones/${id}`)), {
    status: item.status === 'buscando' ? 'encontrado' : 'buscando'
  }).catch(console.error);
}

function removeObservacion(id) {
  if (!requireSala()) return;
  if (confirm('¿Eliminar este registro de Observaciones?')) {
    remove(ref(db, salaPath(`observaciones/${id}`))).catch(console.error);
  }
}

// ---------- Cronómetro compartido ----------
function startAlarm() {
  if (!requireSala()) return;
  set(ref(db, salaPath('alarmStart')), Date.now() + serverOffset).catch(console.error);
}

function resetTimer() {
  if (!requireSala()) return;
  if (confirm('¿Reiniciar el tiempo de alarma a 00:00:00? (Se reinicia para TODOS los dispositivos)')) {
    set(ref(db, salaPath('alarmStart')), null).catch(console.error);
  }
}

function updateTimerDisplay() {
  let seconds = 0;
  if (state.alarmStart) {
    seconds = Math.max(0, Math.floor((Date.now() + serverOffset - state.alarmStart) / 1000));
  }
  const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const formatted = `${hrs}:${mins}:${secs}`;

  document.getElementById('evacuationTimer').innerText = formatted;
  document.getElementById('printTimer').innerText = formatted;

  const running = !!state.alarmStart;
  document.getElementById('btnStartTimer').classList.toggle('hidden', running);
  document.getElementById('btnResetTimer').classList.toggle('hidden', !running);
}

// ---------- Reinicio global ----------
function resetAllEvacuationData() {
  if (!requireSala()) return;
  if (confirm('⚠️ ¿Está seguro de REINICIAR TODOS los conteos, las observaciones y la alarma? Se borrará para TODOS los dispositivos.')) {
    update(ref(db, salaPath()), {
      counts: { PEE_1: 0, PEE_2: 0, PEE_3: 0, PEE_4: 0 },
      observaciones: null,
      alarmStart: null
    }).catch(console.error);
  }
}

// ---------- Navegación por pestañas ----------
function switchTab(tabName) {
  ['tabCounter', 'tabCommand', 'tabObs'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  const buttons = {
    counter: document.getElementById('tabBtn1'),
    command: document.getElementById('tabBtn2'),
    obs: document.getElementById('tabBtn3')
  };
  const sections = { counter: 'tabCounter', command: 'tabCommand', obs: 'tabObs' };

  const base = 'flex-1 py-2.5 rounded-lg transition flex items-center justify-center gap-1.5 font-bold';
  const activeClass = `${base} bg-brand-orange text-white shadow-md`;
  const inactiveClass = `${base} text-gray-300 hover:text-white`;

  Object.values(buttons).forEach(btn => (btn.className = inactiveClass));

  document.getElementById(sections[tabName]).classList.remove('hidden');
  buttons[tabName].className = activeClass;
}

// ---------- Impresión / PDF ----------
function openPrintReport() {
  document.getElementById('printDate').innerText = new Date().toLocaleString();
  window.print();
}

// ---------- Render ----------
function renderUI() {
  const c = state.counts;

  // Selector y contador de ESTE dispositivo
  document.getElementById('peeSelector').value = local.activePEE;
  document.getElementById('peeCounterValue').innerText = c[local.activePEE] || 0;

  // Métricas del puesto de mando (suma de todos los dispositivos)
  const totalEvacuated = PEES.reduce((sum, p) => sum + (c[p] || 0), 0);
  const missing = Math.max(0, state.expectedTotal - totalEvacuated);

  document.getElementById('statExpected').innerText = state.expectedTotal;
  document.getElementById('statEvacuated').innerText = totalEvacuated;
  document.getElementById('statMissing').innerText = missing;

  for (let i = 1; i <= 4; i++) {
    const value = c[`PEE_${i}`] || 0;
    document.getElementById(`peeVal${i}`).innerText = value;
    document.getElementById(`printPEE${i}`).innerText = value;
  }

  document.getElementById('printExpected').innerText = state.expectedTotal;
  document.getElementById('printEvacuated').innerText = totalEvacuated;
  document.getElementById('printMissing').innerText = missing;

  // ----- Observaciones -----
  const byNewest = (a, b) => b.ts - a.ts;
  const searching = state.observaciones.filter(o => o.status === 'buscando').sort(byNewest);
  const found = state.observaciones.filter(o => o.status === 'encontrado').sort(byNewest);

  document.getElementById('statSearching').innerText = searching.length;
  document.getElementById('printSearching').innerText = searching.length;
  document.getElementById('obsSearchingCount').innerText = searching.length;
  document.getElementById('obsFoundCount').innerText = found.length;

  const obsBody = document.getElementById('obsTableBody');
  const emptyObs = document.getElementById('emptyObsMsg');

  if (state.observaciones.length === 0) {
    obsBody.innerHTML = '';
    emptyObs.classList.remove('hidden');
  } else {
    emptyObs.classList.add('hidden');
    obsBody.innerHTML = [...searching, ...found].map(item => {
      const isSearching = item.status === 'buscando';
      return `
        <tr class="${isSearching ? 'bg-red-500/10' : 'bg-green-500/5'}">
          <td class="py-3 px-2 text-sm font-bold">${escapeHtml(item.nombre)}</td>
          <td class="py-3 px-2">
            <span class="inline-block px-2 py-1 rounded-lg font-extrabold text-[11px] ${isSearching ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}">
              ${isSearching ? 'BUSCANDO' : 'ENCONTRADO'}
            </span>
          </td>
          <td class="py-3 px-2 text-right whitespace-nowrap">
            <button onclick="toggleObservacion('${item.id}')" class="btn-tap px-3 py-1.5 rounded-lg font-bold text-[11px] ${isSearching ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-gray-200'}">
              ${isSearching ? 'Marcar Encontrado' : 'Volver a Buscando'}
            </button>
            <button onclick="removeObservacion('${item.id}')" class="ml-2 text-red-400 hover:text-red-200" title="Eliminar">
              <i data-lucide="trash-2" class="w-4 h-4 inline"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Observaciones para impresión (solo las que siguen en búsqueda)
  const printObsBody = document.getElementById('printObsBody');
  if (searching.length === 0) {
    printObsBody.innerHTML = `<tr><td colspan="2" class="py-2 text-center italic text-gray-500">Sin personas en búsqueda.</td></tr>`;
  } else {
    printObsBody.innerHTML = searching.map(item => `
      <tr>
        <td class="py-1.5 font-bold">${escapeHtml(item.nombre)}</td>
        <td class="py-1.5 text-right font-bold text-red-700">BUSCANDO</td>
      </tr>
    `).join('');
  }

  updateTimerDisplay();
  if (window.lucide) window.lucide.createIcons();
}

// ---------- Exponer funciones a los botones del HTML ----------
Object.assign(window, {
  addCount, changeActivePEE, resetCurrentPEE, editTotalExpected,
  handleAddObservacion, toggleObservacion, removeObservacion,
  startAlarm, resetTimer, resetAllEvacuationData,
  switchTab, openPrintReport,
  openSalaModal, closeSalaModal, submitSala
});

// ---------- Inicio ----------
loadLocal();

// Diferencia entre el reloj del celular y el del servidor (para que todos vean el mismo tiempo)
onValue(ref(db, '.info/serverTimeOffset'), snap => {
  serverOffset = snap.val() || 0;
});

onValue(ref(db, '.info/connected'), snap => {
  connected = snap.val() === true;
  updateSyncStatus();
});

setInterval(updateTimerDisplay, 1000);

renderUI();
updateSyncStatus();

if (local.sala && /^[a-z0-9-]{4,40}$/.test(local.sala)) {
  enterSala(local.sala);
} else {
  openSalaModal();
}
