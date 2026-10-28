/**
 * Dashboard Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();
  renderNavbar('dashboard');

  try {
    const res = await apiRequest('/measurements');
    const measurements = res.measurements || [];

    const totalCountEl = document.getElementById('statTotalCount');
    const avgRssiEl = document.getElementById('statAvgRssi');
    const avgStatusEl = document.getElementById('statAvgStatus');
    const bestPointEl = document.getElementById('statBestPoint');
    const bestRssiEl = document.getElementById('statBestRssi');
    const weakPointEl = document.getElementById('statWeakPoint');
    const weakRssiEl = document.getElementById('statWeakRssi');
    const tableBody = document.getElementById('recentMeasurementsTableBody');

    if (measurements.length === 0) {
      totalCountEl.textContent = '0';
      avgRssiEl.textContent = 'N/A';
      avgStatusEl.textContent = 'No data recorded yet';
      bestPointEl.textContent = '--';
      bestRssiEl.textContent = 'No readings';
      weakPointEl.textContent = '--';
      weakRssiEl.textContent = 'No readings';

      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2.5rem;">
            <div style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 0.65rem;">
              <i class="fa-solid fa-tower-broadcast"></i>
            </div>
            <strong>No measurements collected yet</strong>
            <p style="font-size: 0.88rem; color: var(--text-muted); margin-top: 0.25rem;">
              Open the Android application, select a grid point (e.g. A1, B3), and tap <strong>MEASURE & SAVE</strong>.
            </p>
          </td>
        </tr>
      `;
      return;
    }

    // Calculations
    const total = measurements.length;
    let sumRssi = 0;
    let best = measurements[0];
    let weakest = measurements[0];

    measurements.forEach(m => {
      sumRssi += m.signalStrength;
      if (m.signalStrength > best.signalStrength) best = m;
      if (m.signalStrength < weakest.signalStrength) weakest = m;
    });

    const avgRssi = Math.round(sumRssi / total);
    let avgStatus = 'Strong';
    if (avgRssi < -80) avgStatus = 'Very Weak';
    else if (avgRssi < -70) avgStatus = 'Weak';
    else if (avgRssi < -60) avgStatus = 'Fair';
    else if (avgRssi < -50) avgStatus = 'Good';

    // Populate stat cards
    totalCountEl.textContent = total;
    avgRssiEl.textContent = `${avgRssi} dBm`;
    avgStatusEl.innerHTML = `Quality: ${getBadgeHtml(avgStatus)}`;

    bestPointEl.textContent = best.measurementPoint;
    bestRssiEl.textContent = `${best.signalStrength} dBm (${best.signalStatus})`;

    weakPointEl.textContent = weakest.measurementPoint;
    weakRssiEl.textContent = `${weakest.signalStrength} dBm (${weakest.signalStatus})`;

    // Populate recent 5 measurements
    const recent = measurements.slice(0, 5);
    tableBody.innerHTML = recent.map(m => `
      <tr>
        <td>#${m.measurementId}</td>
        <td><strong>${m.measurementPoint}</strong></td>
        <td>${m.signalStrength} dBm</td>
        <td>${m.measurementDate}</td>
        <td>${m.measurementTime}</td>
        <td>${getBadgeHtml(m.signalStatus)}</td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard metrics.', 'error');
  }
});
