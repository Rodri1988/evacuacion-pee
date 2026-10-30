// ==========================================
// Sistema de Evacuación y Conteo Rápido - PEE
// ==========================================

const STORAGE_KEY = 'evac_system_state_v1';

let state = {
  activePEE: 'PEE_1',
  expectedTotal: 150,
  counts: { PEE_1: 0, PEE_2: 0, PEE_3: 0, PEE_4: 0 },
  nomina: [],
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

// Evita inyección de HTML al mostrar nombres/RUT escritos por el usuario
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

// ---------- Nómina ----------
function handleAddNominaPerson(e) {
  e.preventDefault();
  const nombreInput = document.getElementById('inputNombre');
  const rutInput = document.getElementById('inputRut');

  state.nomina.unshift({
    id: Date.now().toString(),
    nombre: nombreInput.value.trim(),
    rut: rutInput.value.trim(),
    pee: state.activePEE.replace('_', ' '),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });

  nombreInput.value = '';
  rutInput.value = '';
  saveState();
}

function removeNominaPerson(id) {
  state.nomina = state.nomina.filter(p => p.id !== id);
  saveState();
}

// ---------- Reinicio global ----------
function resetAllEvacuationData() {
  if (confirm('⚠️ ¿Está seguro de REINICIAR TODOS los conteos de evacuados y la alarma?')) {
    state.counts = { PEE_1: 0, PEE_2: 0, PEE_3: 0, PEE_4: 0 };
    state.nomina = [];
    state.timerSeconds = 0;
    saveState();
  }
}

// ---------- Navegación por pestañas ----------
function switchTab(tabName) {
  ['tabCounter', 'tabCommand', 'tabRoster'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  const buttons = {
    counter: document.getElementById('tabBtn1'),
    command: document.getElementById('tabBtn2'),
    roster: document.getElementById('tabBtn3')
  };
  const sections = {
    counter: 'tabCounter',
    command: 'tabCommand',
    roster: 'tabRoster'
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

  // Tabla de nómina
  const nominaBody = document.getElementById('nominaTableBody');
  const emptyNomina = document.getElementById('emptyNominaMsg');
  document.getElementById('nominaCount').innerText = state.nomina.length;

  if (state.nomina.length === 0) {
    nominaBody.innerHTML = '';
    emptyNomina.classList.remove('hidden');
  } else {
    emptyNomina.classList.add('hidden');
    nominaBody.innerHTML = state.nomina.map(item => `
      <tr class="hover:bg-white/5 transition">
        <td class="py-2.5 px-2 font-bold">${escapeHtml(item.nombre)}</td>
        <td class="py-2.5 px-2 font-mono text-gray-300">${escapeHtml(item.rut)}</td>
        <td class="py-2.5 px-2 text-brand-orange font-bold">${escapeHtml(item.pee)}</td>
        <td class="py-2.5 px-2 text-gray-400 font-mono">${escapeHtml(item.time)}</td>
        <td class="py-2.5 px-2 text-right">
          <button onclick="removeNominaPerson('${item.id}')" class="text-red-400 hover:text-red-200">
            <i data-lucide="trash-2" class="w-4 h-4 inline"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Nómina para impresión
  const printNominaBody = document.getElementById('printNominaBody');
  if (state.nomina.length === 0) {
    printNominaBody.innerHTML = `<tr><td colspan="4" class="py-2 text-center italic text-gray-500">Sin registros nominativos durante el conteo rápido inicial.</td></tr>`;
  } else {
    printNominaBody.innerHTML = state.nomina.map(item => `
      <tr>
        <td class="py-1.5 font-bold">${escapeHtml(item.nombre)}</td>
        <td class="py-1.5 font-mono">${escapeHtml(item.rut)}</td>
        <td class="py-1.5">${escapeHtml(item.pee)}</td>
        <td class="py-1.5 text-right font-mono">${escapeHtml(item.time)}</td>
      </tr>
    `).join('');
  }

  if (window.lucide) window.lucide.createIcons();
}

// ---------- Cronómetro de evacuación ----------
function startTimer() {
  setInterval(() => {
    state.timerSeconds++;
    const hrs = String(Math.floor(state.timerSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((state.timerSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(state.timerSeconds % 60).padStart(2, '0');
    const formatted = `${hrs}:${mins}:${secs}`;

    document.getElementById('evacuationTimer').innerText = formatted;
    document.getElementById('printTimer').innerText = formatted;
  }, 1000);
}

// ---------- Inicio ----------
window.onload = function () {
  loadState();
  renderUI();
  startTimer();
};
