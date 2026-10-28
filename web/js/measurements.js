/**
 * Measurements Management Logic
 * Supports View, Filter, Edit, and Delete
 */

let allMeasurements = [];
let pendingDeleteId = null;

// Generate A1 to E5 grid list
const GRID_POINTS = [];
['A', 'B', 'C', 'D', 'E'].forEach(col => {
  for (let row = 1; row <= 5; row++) {
    GRID_POINTS.push(`${col}${row}`);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();
  renderNavbar('measurements');

  // Populate grid dropdown in Edit modal
  const editGridSelect = document.getElementById('editGridPoint');
  editGridSelect.innerHTML = GRID_POINTS.map(p => `<option value="${p}">${p}</option>`).join('');

  // Event listeners for filters
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);

  // Edit form submit
  document.getElementById('editForm').addEventListener('submit', handleSaveEdit);

  // Confirm delete button
  document.getElementById('confirmDeleteBtn').addEventListener('click', handleConfirmDelete);

  // Clear all button & modal handlers
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', openClearAllModal);
  }

  const confirmClearAllBtn = document.getElementById('confirmClearAllBtn');
  if (confirmClearAllBtn) {
    confirmClearAllBtn.addEventListener('click', handleConfirmClearAll);
  }

  loadMeasurements();
});

async function loadMeasurements() {
  const tableBody = document.getElementById('measurementsTableBody');
  const countLabel = document.getElementById('recordCountLabel');

  try {
    const res = await apiRequest('/measurements');
    allMeasurements = res.measurements || [];
    applyFilters();
  } catch (err) {
    console.error('Load measurements error:', err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #ef4444; padding: 2rem;">
          Failed to load measurements. Please verify server connection.
        </td>
      </tr>
    `;
    countLabel.textContent = 'Error loading records';
  }
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.trim().toUpperCase();
  const statusFilter = document.getElementById('statusFilter').value;
  const tableBody = document.getElementById('measurementsTableBody');
  const countLabel = document.getElementById('recordCountLabel');

  const filtered = allMeasurements.filter(m => {
    const matchesSearch = !search || m.measurementPoint.toUpperCase().includes(search);
    const matchesStatus = statusFilter === 'ALL' || m.signalStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  countLabel.textContent = `Showing ${filtered.length} of ${allMeasurements.length} records`;

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 2.5rem;">
          <div style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.65rem;">
            <i class="fa-solid fa-magnifying-glass"></i>
          </div>
          <strong>No matching measurements found</strong>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
            ${allMeasurements.length === 0 ? 'Use the Android application to collect Wi-Fi signal measurements.' : 'Try adjusting your search or filter options.'}
          </p>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(m => `
    <tr>
      <td>#${m.measurementId}</td>
      <td><strong>${m.measurementPoint}</strong></td>
      <td>${m.signalStrength} dBm</td>
      <td>${m.measurementDate}</td>
      <td>${m.measurementTime}</td>
      <td>${getBadgeHtml(m.signalStatus)}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="openEditModal(${m.measurementId})">
          <i class="fa-solid fa-pen-to-square"></i> Edit
        </button>
        <button class="btn btn-danger btn-sm" onclick="openDeleteModal(${m.measurementId})" style="margin-left: 0.4rem;">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </td>
    </tr>
  `).join('');
}

// Edit Modal Handling
function openEditModal(measurementId) {
  const m = allMeasurements.find(item => item.measurementId === measurementId);
  if (!m) return;

  document.getElementById('editMeasurementId').value = m.measurementId;
  document.getElementById('editGridPoint').value = m.measurementPoint;
  document.getElementById('editRssi').value = m.signalStrength;

  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
}

async function handleSaveEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editMeasurementId').value;
  const gridPoint = document.getElementById('editGridPoint').value;
  const rssi = parseInt(document.getElementById('editRssi').value, 10);
  const saveBtn = document.getElementById('saveEditBtn');

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const res = await apiRequest(`/measurements/${id}`, {
      method: 'PUT',
      body: {
        measurementPoint: gridPoint,
        signalStrength: rssi
      }
    });

    if (res.success) {
      showToast('Measurement updated successfully.', 'success');
      closeEditModal();
      await loadMeasurements();
    } else {
      showToast(res.message || 'Update failed.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error updating measurement.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

// Delete Modal Handling
function openDeleteModal(measurementId) {
  const m = allMeasurements.find(item => item.measurementId === measurementId);
  if (!m) return;

  pendingDeleteId = measurementId;
  const detailsBox = document.getElementById('deleteDetailsBox');
  detailsBox.innerHTML = `
    <strong>Measurement #${m.measurementId}</strong><br>
    Grid Location: <strong>${m.measurementPoint}</strong> | RSSI: <strong>${m.signalStrength} dBm</strong><br>
    Recorded: ${m.measurementDate} at ${m.measurementTime}
  `;

  document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('deleteModal').classList.remove('active');
}

async function handleConfirmDelete() {
  if (!pendingDeleteId) return;

  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const res = await apiRequest(`/measurements/${pendingDeleteId}`, {
      method: 'DELETE'
    });

    if (res.success) {
      showToast('Measurement deleted successfully.', 'success');
      closeDeleteModal();
      await loadMeasurements();
    } else {
      showToast(res.message || 'Delete failed.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error deleting measurement.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete Record';
  }
}

// Clear All Modal Handling
function openClearAllModal() {
  document.getElementById('clearAllModal').classList.add('active');
}

function closeClearAllModal() {
  document.getElementById('clearAllModal').classList.remove('active');
}

async function handleConfirmClearAll() {
  const btn = document.getElementById('confirmClearAllBtn');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...';

  try {
    const res = await apiRequest('/measurements', {
      method: 'DELETE'
    });

    if (res.success) {
      showToast('All measurements cleared successfully.', 'success');
      closeClearAllModal();
      await loadMeasurements();
    } else {
      showToast(res.message || 'Failed to clear measurements.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error clearing measurements.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

