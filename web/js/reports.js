/**
 * Reports Management & PDF Export Controller
 */

let allReports = [];
let pendingDeleteReportId = null;

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  renderNavbar('reports');

  document.getElementById('openGenerateReportModalBtn').addEventListener('click', openGenerateModal);
  document.getElementById('generateReportForm').addEventListener('submit', handleGenerateReport);
  document.getElementById('confirmDeleteReportBtn').addEventListener('click', handleConfirmDeleteReport);

  const viewModal = document.getElementById('viewReportModal');
  if (viewModal) {
    viewModal.addEventListener('click', (e) => {
      if (e.target.id === 'viewReportModal') {
        closeViewModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeViewModal();
      closeGenerateModal();
      closeDeleteReportModal();
    }
  });

  loadReports();
});

async function loadReports() {
  const tableBody = document.getElementById('reportsTableBody');

  try {
    const res = await apiRequest('/reports');
    allReports = res.reports || [];

    if (allReports.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 2.5rem;">
            <div style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.65rem;">
              <i class="fa-solid fa-folder-open"></i>
            </div>
            <strong>No reports generated yet</strong>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
              Click <strong>Generate New Report</strong> to synthesize your collected Wi-Fi RSSI measurements.
            </p>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = allReports.map(r => {
      const s = r.summaryDetails || {};
      const total = s.totalMeasurements !== undefined ? s.totalMeasurements : '--';
      const avg = s.averageRssi !== undefined ? `${s.averageRssi} dBm` : '--';

      return `
        <tr>
          <td>#${r.reportId}</td>
          <td><strong>${r.reportTitle}</strong></td>
          <td>${r.generatedDate}</td>
          <td>${r.generatedTime}</td>
          <td>${total}</td>
          <td>${avg}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-primary btn-sm" onclick="viewReportDetails(${r.reportId})">
              <i class="fa-solid fa-eye"></i> View Report
            </button>
            <button class="btn btn-secondary btn-sm" onclick="quickPrint(${r.reportId})" style="margin-left: 0.35rem;">
              <i class="fa-solid fa-print"></i> Print/PDF
            </button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteReportModal(${r.reportId})" style="margin-left: 0.35rem;" title="Delete Report">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load reports:', err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #ef4444; padding: 2rem;">
          Failed to load reports archive. Please try again.
        </td>
      </tr>
    `;
  }
}

// Generate Report Modal
function openGenerateModal() {
  document.getElementById('reportTitleInput').value = 'Wi-Fi Coverage & Optimization Survey Report';
  document.getElementById('networkNameInput').value = '';
  document.getElementById('generateModal').classList.add('active');
}

function closeGenerateModal() {
  document.getElementById('generateModal').classList.remove('active');
}

async function handleGenerateReport(e) {
  e.preventDefault();
  const title = document.getElementById('reportTitleInput').value.trim();
  const network = document.getElementById('networkNameInput').value.trim();
  const btn = document.getElementById('generateSubmitBtn');

  btn.disabled = true;
  btn.textContent = 'Analyzing & Generating...';

  try {
    const res = await apiRequest('/reports', {
      method: 'POST',
      body: {
        reportTitle: title,
        networkName: network
      }
    });

    if (res.success) {
      showToast('Optimization report generated successfully!', 'success');
      closeGenerateModal();
      await loadReports();
      viewReportDetails(res.report.reportId);
    } else {
      showToast(res.message || 'Failed to generate report.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error creating report. Ensure measurements exist.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Report';
  }
}

// View & Print Report Modal
async function viewReportDetails(reportId) {
  const container = document.getElementById('printableReportContent');
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading report breakdown...</div>';
  document.body.classList.add('report-modal-active');
  document.getElementById('viewReportModal').classList.add('active');

  try {
    const res = await apiRequest(`/reports/${reportId}`);
    const report = res.report;
    const s = report.reportSummary || {};
    const measurements = report.measurements || [];

    const weakZonesText = s.weakZones && s.weakZones.length > 0
      ? s.weakZones.join(', ')
      : 'None detected (All measured points maintain &ge; -70 dBm)';

    const tipsHtml = s.optimizationTips && s.optimizationTips.length > 0
      ? s.optimizationTips.map(t => `<li style="margin-bottom: 0.4rem;">${t}</li>`).join('')
      : '<li>Coverage is balanced. Maintain current Access Point position.</li>';

    const q = s.qualityDistribution || { strong: 0, good: 0, fair: 0, weak: 0, veryWeak: 0 };

    container.innerHTML = `
      <div style="border-bottom: 2px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div>
            <span style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-blue); font-weight: 700;">
              B.Sc. Computer Science Final Year Project
            </span>
            <h2 style="font-size: 1.6rem; font-weight: 800; margin-top: 0.2rem; color: var(--text-primary);">
              ${report.reportTitle}
            </h2>
            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;">
              Target Network: <strong>${s.networkName || 'Detected Wi-Fi'}</strong> &bull; Generated: ${report.generatedDate} at ${report.generatedTime}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Report Reference</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">#RPT-${report.reportId}</div>
          </div>
        </div>
      </div>

      <!-- Key Performance Metrics Summary -->
      <div class="stats-grid" style="margin-bottom: 1.5rem;">
        <div class="stat-card" style="padding: 1rem;">
          <div class="stat-title">Total Points</div>
          <div class="stat-value" style="font-size: 1.6rem;">${s.totalMeasurements || measurements.length}</div>
          <div class="stat-desc">5x5 Grid Locations</div>
        </div>
        <div class="stat-card" style="padding: 1rem;">
          <div class="stat-title">Average RSSI</div>
          <div class="stat-value" style="font-size: 1.6rem;">${s.averageRssi || '--'} dBm</div>
          <div class="stat-desc">Overall: ${s.overallQuality || '--'}</div>
        </div>
        <div class="stat-card card-strong" style="padding: 1rem;">
          <div class="stat-title">Peak Signal</div>
          <div class="stat-value" style="font-size: 1.6rem;">${s.strongestPoint ? s.strongestPoint.point : '--'}</div>
          <div class="stat-desc">${s.strongestPoint ? s.strongestPoint.rssi + ' dBm' : '--'}</div>
        </div>
        <div class="stat-card card-veryweak" style="padding: 1rem;">
          <div class="stat-title">Weakest Point</div>
          <div class="stat-value" style="font-size: 1.6rem;">${s.weakestPoint ? s.weakestPoint.point : '--'}</div>
          <div class="stat-desc">${s.weakestPoint ? s.weakestPoint.rssi + ' dBm' : '--'}</div>
        </div>
      </div>

      <!-- Signal Quality Distribution Breakdown -->
      <div style="margin-bottom: 1.5rem; background: var(--bg-input); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
        <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem;">Signal Quality Distribution</h4>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.88rem;">
          <div><span class="badge badge-strong">Strong</span>: <strong>${q.strong}</strong></div>
          <div><span class="badge badge-good">Good</span>: <strong>${q.good}</strong></div>
          <div><span class="badge badge-fair">Fair</span>: <strong>${q.fair}</strong></div>
          <div><span class="badge badge-weak">Weak</span>: <strong>${q.weak}</strong></div>
          <div><span class="badge badge-veryweak">Very Weak</span>: <strong>${q.veryWeak}</strong></div>
        </div>
        <div style="margin-top: 0.75rem; font-size: 0.88rem; color: var(--text-secondary);">
          <strong>Critical / Low Signal Zones:</strong> <span style="color: #f87171;">${weakZonesText}</span>
        </div>
      </div>

      <!-- Wi-Fi Optimization Recommendations -->
      <div style="margin-bottom: 1.5rem; background: rgba(59, 130, 246, 0.08); border-left: 4px solid var(--accent-blue); padding: 1.25rem; border-radius: 4px;">
        <h4 style="font-size: 1rem; font-weight: 700; color: #60a5fa; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-lightbulb" style="color: #facc15;"></i>
          <span>Wi-Fi Network Optimization Recommendations</span>
        </h4>
        <ul style="padding-left: 1.2rem; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
          ${tipsHtml}
        </ul>
      </div>

      <!-- Tabular Measurement Log -->
      <div>
        <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem;">Survey Measurement Log</h4>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Point</th>
                <th>RSSI (dBm)</th>
                <th>Status</th>
                <th>Survey Date</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${measurements && measurements.length > 0 ? measurements.map(m => `
                <tr>
                  <td><strong>${m.measurementPoint}</strong></td>
                  <td>${m.signalStrength} dBm</td>
                  <td>${getBadgeHtml(m.signalStatus)}</td>
                  <td>${m.measurementDate}</td>
                  <td>${m.measurementTime}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                    No measurement records recorded for this report.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Official Academic Report Footer for Print / PDF Export -->
      <div style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem; font-size: 0.8rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid; break-inside: avoid;">
        <span>Wi-Fi Signal Strength Visualization &amp; Optimization System</span>
        <span>B.Sc. Final Year Project &bull; Report ID: #RPT-${report.reportId}</span>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444; padding: 2rem;">Error: ${err.message}</div>`;
  }
}

function closeViewModal() {
  document.body.classList.remove('report-modal-active');
  document.getElementById('viewReportModal').classList.remove('active');
}

function printReport() {
  document.body.classList.add('report-modal-active');
  window.print();
}

async function quickPrint(reportId) {
  await viewReportDetails(reportId);
  setTimeout(() => {
    window.print();
  }, 400);
}

// Delete Report
function openDeleteReportModal(reportId) {
  pendingDeleteReportId = reportId;
  document.getElementById('deleteReportModal').classList.add('active');
}

function closeDeleteReportModal() {
  pendingDeleteReportId = null;
  document.getElementById('deleteReportModal').classList.remove('active');
}

async function handleConfirmDeleteReport() {
  if (!pendingDeleteReportId) return;
  const btn = document.getElementById('confirmDeleteReportBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const res = await apiRequest(`/reports/${pendingDeleteReportId}`, {
      method: 'DELETE'
    });

    if (res.success) {
      showToast('Report deleted successfully.', 'success');
      closeDeleteReportModal();
      await loadReports();
    } else {
      showToast(res.message || 'Failed to delete report.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error deleting report.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
}
