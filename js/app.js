// ==========================================
// Sistema de Evacuación y Conteo Rápido - PEE
// ==========================================

const STORAGE_KEY = 'evac_system_state_v1';

let state = {
  activePEE: 'PEE_1',
  expectedTotal: 150,
  counts: { PEE_1: 0, PEE_2: 0, PEE_3: 0, PEE_4: 0 },
  observaciones: [], // { id, nombre, status: 'buscando' | 'encontrado' }
  timerSeconds: 0,
  timerRunning: true
};

// ---------- Persistencia ----------
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error cargando estado:', e);
    }
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderUI();
}

// ---------- Utilidades ----------
function triggerHaptic() {
  if ('vibrate' in navigator) {
    navigator.vibrate(40);
  }
}

// Evita inyección de HTML al mostrar nombres escritos por el usuario
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- Conteo ----------
function addCount(amount) {
  triggerHaptic();
  const current = state.counts[state.activePEE] || 0;
  state.counts[state.activePEE] = Math.max(0, current + amount);
  saveState();
}

function changeActivePEE() {
  state.activePEE = document.getElementById('peeSelector').value;
  saveState();
}

function resetCurrentPEE() {
  if (confirm(`¿Reiniciar a cero el conteo del ${state.activePEE.replace('_', ' ')}?`)) {
    state.counts[state.activePEE] = 0;
    saveState();
  }
}

function editTotalExpected() {
  const input = prompt('Ingrese la Dotación Total Esperada en Turno:', state.expectedTotal);
  if (input !== null) {
    const val = parseInt(input, 10);
    if (!isNaN(val) && val >= 0) {
      state.expectedTotal = val;
      saveState();
    }
  }
}

// ---------- Observaciones (personas que se buscan) ----------
function handleAddObservacion(e) {
  e.preventDefault();
  const nombreInput = document.getElementById('inputNombre');
  const nombre = nombreInput.value.trim();
  if (!nombre) return;

  triggerHaptic();
  state.observaciones.unshift({
    id: Date.now().toString(),
    nombre: nombre,
    status: 'buscando'
  });

  nombreInput.value = '';
  saveState();
}

function toggleObservacion(id) {
  triggerHaptic();
  const item = state.observaciones.find(o => o.id === id);
  if (!item) return;
  item.status = item.status === 'buscando' ? 'encontrado' : 'buscando';
  saveState();
}

function removeObservacion(id) {
  if (confirm('¿Eliminar este registro de Observaciones?')) {
    state.observaciones = state.observaciones.filter(o => o.id !== id);
    saveState();
  }
}

// ---------- Reinicio global ----------
function resetAllEvacuationData() {
  if (confirm('⚠️ ¿Está seguro de REINICIAR TODOS los conteos, las observaciones y la alarma?')) {
    state.counts = { PEE_1: 0, PEE_2: 0, PEE_3: 0, PEE_4: 0 };
    state.observaciones = [];
    state.timerSeconds = 0;
    updateTimerDisplay();
    saveState();
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
  const sections = {
    counter: 'tabCounter',
    command: 'tabCommand',
    obs: 'tabObs'
  };

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
  // Selector y contador activo
  document.getElementById('peeSelector').value = state.activePEE;
  document.getElementById('peeCounterValue').innerText = state.counts[state.activePEE] || 0;

  // Métricas del puesto de mando
  const c = state.counts;
  const totalEvacuated = (c.PEE_1 || 0) + (c.PEE_2 || 0) + (c.PEE_3 || 0) + (c.PEE_4 || 0);
  const missing = Math.max(0, state.expectedTotal - totalEvacuated);

  document.getElementById('statExpected').innerText = state.expectedTotal;
  document.getElementById('statEvacuated').innerText = totalEvacuated;
  document.getElementById('statMissing').innerText = missing;

  // Desglose por PEE (pantalla e impresión)
  for (let i = 1; i <= 4; i++) {
    const value = c[`PEE_${i}`] || 0;
    document.getElementById(`peeVal${i}`).innerText = value;
    document.getElementById(`printPEE${i}`).innerText = value;
  }

  // Elementos de impresión
  document.getElementById('printExpected').innerText = state.expectedTotal;
  document.getElementById('printEvacuated').innerText = totalEvacuated;
  document.getElementById('printMissing').innerText = missing;

  // ----- Observaciones -----
  const obs = state.observaciones;
  const searching = obs.filter(o => o.status === 'buscando');
  const found = obs.filter(o => o.status === 'encontrado');

  document.getElementById('statSearching').innerText = searching.length;
  document.getElementById('printSearching').innerText = searching.length;
  document.getElementById('obsSearchingCount').innerText = searching.length;
  document.getElementById('obsFoundCount').innerText = found.length;

  const obsBody = document.getElementById('obsTableBody');
  const emptyObs = document.getElementById('emptyObsMsg');

  if (obs.length === 0) {
    obsBody.innerHTML = '';
    emptyObs.classList.remove('hidden');
  } else {
    emptyObs.classList.add('hidden');
    // Primero los que se siguen buscando, luego los encontrados
    const ordered = [...searching, ...found];
    obsBody.innerHTML = ordered.map(item => {
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

  if (window.lucide) window.lucide.createIcons();
}

// ---------- Cronómetro de evacuación ----------
function updateTimerDisplay() {
  const hrs = String(Math.floor(state.timerSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((state.timerSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(state.timerSeconds % 60).padStart(2, '0');
  const formatted = `${hrs}:${mins}:${secs}`;

  document.getElementById('evacuationTimer').innerText = formatted;
  document.getElementById('printTimer').innerText = formatted;
}

function startTimer() {
  setInterval(() => {
    state.timerSeconds++;
    updateTimerDisplay();
    // Guarda el tiempo cada 5 segundos para no perderlo si se cierra la página
    if (state.timerSeconds % 5 === 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, 1000);
}

function resetTimer() {
  if (confirm('¿Reiniciar el tiempo de alarma a 00:00:00?')) {
    state.timerSeconds = 0;
    updateTimerDisplay();
    saveState();
  }
}

// ---------- Inicio ----------
window.onload = function () {
  loadState();
  renderUI();
  updateTimerDisplay();
  startTimer();
};
