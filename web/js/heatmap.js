/**
 * Heatmap.js Visualization & Grid Controller
 */

let heatmapInstance = null;
let currentMeasurements = [];
let latestByPoint = {};
let currentVibrancy = 0.95;

const COLS = ['A', 'B', 'C', 'D', 'E'];
const ROWS = [1, 2, 3, 4, 5];

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  renderNavbar('heatmap');

  initGridOverlay();
  initHeatmap();

  document.getElementById('refreshHeatmapBtn').addEventListener('click', () => {
    showToast('Refreshing heatmap data...', 'info');
    loadHeatmapData();
  });

  const clearBtn = document.getElementById('clearHeatmapBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', openClearModal);
  }

  const confirmClearBtn = document.getElementById('confirmClearBtn');
  if (confirmClearBtn) {
    confirmClearBtn.addEventListener('click', handleConfirmClear);
  }

  const slider = document.getElementById('opacitySlider');
  const valText = document.getElementById('opacityValText');
  if (slider) {
    slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      currentVibrancy = val / 100;
      if (valText) valText.textContent = `${val}%`;
      initHeatmap();
      renderHeatmapData();
      updateGridLabels();
    });
  }

  window.addEventListener('resize', debounce(() => {
    initHeatmap();
    renderHeatmapData();
  }, 250));

  loadHeatmapData();
});

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Render 5x5 grid cells overlay
 */
function initGridOverlay() {
  const overlay = document.getElementById('gridOverlay');
  overlay.innerHTML = '';

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const point = `${COLS[c]}${ROWS[r]}`;
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.id = `cell-${point}`;
      cell.dataset.point = point;

      cell.innerHTML = `
        <span class="grid-cell-label">${point}</span>
        <span class="grid-cell-rssi" id="rssi-${point}">--</span>
      `;

      cell.addEventListener('click', () => inspectPoint(point));
      overlay.appendChild(cell);
    }
  }
}

/**
 * Calibrated Wi-Fi RSSI to Heatmap Intensity normalization
 * Strictly matches standard indoor Wi-Fi thresholds:
 * Strong:    -30 to -50 dBm -> 85 to 100 -> Green (#10b981)
 * Good:      -51 to -60 dBm -> 65 to 84  -> Lime (#84cc16)
 * Fair:      -61 to -70 dBm -> 45 to 64  -> Yellow (#eab308)
 * Weak:      -71 to -80 dBm -> 25 to 44  -> Orange (#f97316)
 * Very Weak: < -80 dBm       -> 5 to 24   -> Red (#ef4444)
 */
function calculateHeatmapIntensity(rssi) {
  const val = Number(rssi);
  if (isNaN(val)) return 0;
  if (val >= -50) {
    // Strong: -50 dBm -> 85, -30 dBm -> 100
    const clamped = Math.min(-30, val);
    return Math.round(85 + ((clamped - (-50)) / 20) * 15);
  } else if (val >= -60) {
    // Good: -60 dBm -> 65, -50 dBm -> 85
    return Math.round(65 + ((val - (-60)) / 10) * 20);
  } else if (val >= -70) {
    // Fair: -70 dBm -> 45, -60 dBm -> 65
    return Math.round(45 + ((val - (-70)) / 10) * 20);
  } else if (val >= -80) {
    // Weak: -80 dBm -> 25, -70 dBm -> 45
    return Math.round(25 + ((val - (-80)) / 10) * 20);
  } else {
    // Very Weak / Dead Zone: < -80 dBm down to -95 dBm -> 5 to 25
    const clamped = Math.max(-95, val);
    return Math.round(Math.max(5, 25 - ((-80 - clamped) / 15) * 20));
  }
}

/**
 * Maps Wi-Fi signal status to standard project colors
 */
function getStatusColor(status) {
  switch (status) {
    case 'Strong': return '#10b981';
    case 'Good': return '#84cc16';
    case 'Fair': return '#eab308';
    case 'Weak': return '#f97316';
    case 'Very Weak': return '#ef4444';
    default: return '#94a3b8';
  }
}

/**
 * Initialize Heatmap.js instance
 */
function initHeatmap() {
  const container = document.getElementById('heatmapCanvas');
  container.innerHTML = ''; // Clear previous canvas

  if (typeof h337 === 'undefined') {
    console.error('Heatmap.js library (h337) not loaded.');
    showToast('Heatmap library missing. Please refresh.', 'error');
    return;
  }

  heatmapInstance = h337.create({
    container: container,
    radius: 95,
    maxOpacity: currentVibrancy,
    minOpacity: Math.max(0.45, currentVibrancy * 0.60),
    blur: 0.80,
    gradient: {
      '0.0': '#dc2626', // Deep Red (Dead zone < -90 dBm)
      '0.20': '#ef4444', // Red: Very Weak (< -80 dBm)
      '0.40': '#f97316', // Orange: Weak (-71 to -80 dBm)
      '0.60': '#eab308', // Yellow: Fair (-61 to -70 dBm)
      '0.80': '#84cc16', // Lime: Good (-51 to -60 dBm)
      '0.95': '#10b981', // Strong Green (-30 to -50 dBm)
      '1.0': '#059669'   // Deep Emerald (Access Point Peak)
    }
  });
}

/**
 * Fetch latest measurements from Node.js REST API
 */
async function loadHeatmapData() {
  try {
    const res = await apiRequest('/measurements');
    currentMeasurements = res.measurements || [];

    // Group by grid point (keep latest measurement for each grid point)
    latestByPoint = {};
    currentMeasurements.forEach(m => {
      const p = m.measurementPoint.toUpperCase();
      if (!latestByPoint[p]) {
        latestByPoint[p] = m;
      }
    });

    renderHeatmapData();
    updateGridLabels();
    updateCoverageInsights();
  } catch (err) {
    console.error('Error loading measurements for heatmap:', err);
    showToast('Failed to load heatmap data.', 'error');
  }
}

/**
 * Map grid coordinates to container pixels and render heatmap
 */
function renderHeatmapData() {
  if (!heatmapInstance) return;

  const container = document.getElementById('heatmapContainer');
  const rect = container.getBoundingClientRect();
  const width = rect.width || 500;
  const height = rect.height || 500;

  const cellWidth = width / 5;
  const cellHeight = height / 5;

  const heatmapPoints = [];

  Object.keys(latestByPoint).forEach(point => {
    const m = latestByPoint[point];
    const colChar = point.charAt(0);
    const rowNum = parseInt(point.substring(1), 10);

    const colIndex = COLS.indexOf(colChar);
    const rowIndex = ROWS.indexOf(rowNum);

    if (colIndex !== -1 && rowIndex !== -1) {
      const x = Math.round((colIndex + 0.5) * cellWidth);
      const y = Math.round((rowIndex + 0.5) * cellHeight);

      // Calibrated Wi-Fi intensity value [5, 100]
      const value = calculateHeatmapIntensity(m.signalStrength);

      heatmapPoints.push({ x, y, value });
    }
  });

  heatmapInstance.setData({
    max: 100,
    min: 0,
    data: heatmapPoints
  });
}

/**
 * Update the text displayed on each grid cell
 */
function updateGridLabels() {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const point = `${COLS[c]}${ROWS[r]}`;
      const rssiEl = document.getElementById(`rssi-${point}`);
      const cellEl = document.getElementById(`cell-${point}`);
      const m = latestByPoint[point];

      if (rssiEl) {
        if (m) {
          const color = getStatusColor(m.signalStatus);
          rssiEl.textContent = `${m.signalStrength} dBm`;
          rssiEl.style.color = '#ffffff';
          rssiEl.style.backgroundColor = color;
          rssiEl.style.fontWeight = '700';
          rssiEl.style.fontSize = '0.74rem';
          rssiEl.style.padding = '3px 8px';
          rssiEl.style.borderRadius = '12px';
          rssiEl.style.border = '1px solid rgba(255, 255, 255, 0.45)';
          rssiEl.style.boxShadow = `0 2px 10px ${color}cc, 0 0 8px ${color}88`;

          if (cellEl) {
            // Vivid translucent wash matching cell status and vibrancy
            const alphaHex = Math.round(currentVibrancy * 55).toString(16).padStart(2, '0');
            cellEl.style.backgroundColor = `${color}${alphaHex}`;
            cellEl.style.borderColor = `${color}aa`;
          }

          const labelEl = cellEl ? cellEl.querySelector('.grid-cell-label') : null;
          if (labelEl) {
            labelEl.style.backgroundColor = 'rgba(11, 17, 32, 0.9)';
            labelEl.style.border = `1px solid ${color}aa`;
            labelEl.style.boxShadow = `0 0 6px ${color}44`;
            labelEl.style.color = '#ffffff';
          }
        } else {
          rssiEl.textContent = 'No data';
          rssiEl.style.color = '#94a3b8';
          rssiEl.style.backgroundColor = 'rgba(15, 23, 42, 0.6)';
          rssiEl.style.padding = '2px 6px';
          rssiEl.style.borderRadius = '4px';
          rssiEl.style.border = '1px solid rgba(255, 255, 255, 0.1)';
          rssiEl.style.boxShadow = 'none';

          if (cellEl) {
            cellEl.style.backgroundColor = 'transparent';
            cellEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
          }

          const labelEl = cellEl ? cellEl.querySelector('.grid-cell-label') : null;
          if (labelEl) {
            labelEl.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
            labelEl.style.border = 'none';
            labelEl.style.color = '#ffffff';
            labelEl.style.boxShadow = 'none';
          }
        }
      }
    }
  }
}

/**
 * Inspect selected grid point
 */
function inspectPoint(point) {
  // Update selected visual state on grid
  document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected'));
  const activeCell = document.getElementById(`cell-${point}`);
  if (activeCell) {
    activeCell.classList.add('selected');
  }

  const m = latestByPoint[point];
  const inspector = document.getElementById('inspectorContent');

  if (!m) {
    inspector.innerHTML = `
      <div style="background: var(--bg-input); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
        <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">Grid Point: ${point}</div>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem;">
          No measurement recorded at this location yet.
        </p>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.75rem;">
          Take your Android device to this physical spot and tap <strong>MEASURE &amp; SAVE</strong> with grid point <strong>${point}</strong> selected.
        </p>
      </div>
    `;
    return;
  }

  const intensity = calculateHeatmapIntensity(m.signalStrength);
  const color = getStatusColor(m.signalStatus);

  inspector.innerHTML = `
    <div style="background: var(--bg-input); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-size: 1.3rem; font-weight: 700;">Location: ${m.measurementPoint}</span>
        ${getBadgeHtml(m.signalStatus)}
      </div>

      <div style="font-size: 2.2rem; font-weight: 800; color: ${color}; text-shadow: 0 0 12px ${color}55; margin-bottom: 0.5rem;">
        ${m.signalStrength} <span style="font-size: 1rem; font-weight: 400; color: var(--text-secondary);">dBm</span>
      </div>

      <!-- Vibrant Intensity Bar -->
      <div style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
          <span style="color: var(--text-secondary);">Signal Heat Intensity</span>
          <span style="color: ${color}; font-weight: 700;">${intensity} / 100</span>
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
          <div style="width: ${intensity}%; height: 100%; background: ${color}; box-shadow: 0 0 10px ${color}; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.7; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
        <div><strong>Signal Quality:</strong> <span style="color: ${color}; font-weight: 700;">${m.signalStatus}</span></div>
        <div><strong>Recorded Date:</strong> ${m.measurementDate}</div>
        <div><strong>Recorded Time:</strong> ${m.measurementTime}</div>
      </div>
    </div>
  `;
}

/**
 * Coverage statistics & optimization advice
 */
function updateCoverageInsights() {
  const measuredPoints = Object.keys(latestByPoint);
  const totalSurveyed = measuredPoints.length;
  const metricsEl = document.getElementById('coverageMetricsText');
  const alertEl = document.getElementById('deadZonesAlert');

  if (totalSurveyed === 0) {
    metricsEl.textContent = 'No measurement data recorded yet. Please capture RSSI data using the Android app.';
    alertEl.innerHTML = '';
    return;
  }

  const weakPoints = [];
  let satisfactoryCount = 0;

  measuredPoints.forEach(p => {
    const m = latestByPoint[p];
    if (m.signalStrength >= -70) {
      satisfactoryCount++;
    } else {
      weakPoints.push(`${p} (${m.signalStrength} dBm)`);
    }
  });

  const satisfactoryPct = Math.round((satisfactoryCount / totalSurveyed) * 100);

  metricsEl.innerHTML = `
    <strong>Grid Coverage:</strong> ${totalSurveyed} of 25 grid points surveyed (${Math.round((totalSurveyed / 25) * 100)}%).<br>
    <strong>Quality Ratio:</strong> ${satisfactoryPct}% of surveyed points have satisfactory signal (&ge; -70 dBm).
  `;

  if (weakPoints.length > 0) {
    alertEl.innerHTML = `
      <div style="margin-top: 1rem; padding: 0.85rem; background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--status-veryweak); border-radius: 4px;">
        <strong style="color: #f87171; display: inline-flex; align-items: center; gap: 0.4rem;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Weak Signal / Dead Zones Detected:</span>
        </strong>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.35rem;">
          Low coverage observed at: <strong>${weakPoints.join(', ')}</strong>.
        </p>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.35rem;">
          Optimization Recommendation: Reposition the central Access Point or add a Wi-Fi range extender adjacent to these cells.
        </p>
      </div>
    `;
  } else {
    alertEl.innerHTML = `
      <div style="margin-top: 1rem; padding: 0.85rem; background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--status-strong); border-radius: 4px;">
        <strong style="color: #34d399; display: inline-flex; align-items: center; gap: 0.4rem;">
          <i class="fa-solid fa-circle-check"></i>
          <span>Good Coverage Distribution</span>
        </strong>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.35rem;">
          All surveyed points maintain signal strength above -70 dBm. Current Access Point placement is optimal.
        </p>
      </div>
    `;
  }
}

/**
 * Open clear heatmap confirmation modal
 */
function openClearModal() {
  const modal = document.getElementById('clearHeatmapModal');
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Close clear heatmap confirmation modal
 */
function closeClearModal() {
  const modal = document.getElementById('clearHeatmapModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Execute clearing all measurements from server and reset local heatmap
 */
async function handleConfirmClear() {
  const confirmBtn = document.getElementById('confirmClearBtn');
  const originalText = confirmBtn.innerHTML;

  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...';

  try {
    const res = await apiRequest('/measurements', {
      method: 'DELETE'
    });

    if (res.success) {
      showToast('Heatmap cleared! You can now start taking new measurements.', 'success');
      closeClearModal();

      // Clear local in-memory dataset
      currentMeasurements = [];
      latestByPoint = {};

      // Clear heatmap canvas target
      if (heatmapInstance) {
        heatmapInstance.setData({
          max: 100,
          min: 0,
          data: []
        });
      }

      // Reset grid cell labels and colors back to blank states
      updateGridLabels();

      // Reset inspector display
      const inspector = document.getElementById('inspectorContent');
      if (inspector) {
        inspector.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">
            Click or tap any grid cell (A1–E5) to inspect its signal metrics
          </div>
        `;
      }

      // Reset coverage insights and dead zones alert
      updateCoverageInsights();
    } else {
      showToast(res.message || 'Failed to clear heatmap data.', 'error');
    }
  } catch (err) {
    console.error('Error clearing heatmap data:', err);
    showToast(err.message || 'Error communicating with server.', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
  }
}

