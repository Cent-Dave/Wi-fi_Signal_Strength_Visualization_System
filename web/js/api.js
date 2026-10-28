/**
 * Wi-Fi Signal Strength Visualization System
 * Core Client API & Shared Utilities
 */

const API_BASE_URL = '/api';

/**
 * Authentication state helpers
 */
function getToken() {
  return localStorage.getItem('wifi_app_token');
}

function getUser() {
  const u = localStorage.getItem('wifi_app_user');
  try {
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem('wifi_app_token', token);
  localStorage.setItem('wifi_app_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('wifi_app_token');
  localStorage.removeItem('wifi_app_user');
}

function isAuthenticated() {
  return !!getToken();
}

/**
 * Page protection guards
 */
function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'login.html';
  }
}

function redirectIfLoggedIn() {
  if (isAuthenticated()) {
    window.location.href = 'dashboard.html';
  }
}

/**
 * Logout Confirmation Modal
 */
function confirmLogout() {
  let modal = document.getElementById('globalLogoutModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalLogoutModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 420px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem; font-weight: 600; color: #f87171; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Confirm Logout</span>
          </h3>
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeLogoutModal()" style="border: none; font-size: 1.1rem;" aria-label="Close modal"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <p style="color: var(--text-secondary); font-size: 0.95rem;">
            Are you sure you want to log out of your account?
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeLogoutModal()"><i class="fa-solid fa-xmark"></i> Cancel</button>
          <button type="button" class="btn btn-danger" onclick="executeLogout()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Log Out</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.classList.add('active');
}

function closeLogoutModal() {
  const modal = document.getElementById('globalLogoutModal');
  if (modal) modal.classList.remove('active');
}

function executeLogout() {
  closeLogoutModal();
  clearAuth();
  showToast('Logged out successfully.', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 400);
}

function logout() {
  confirmLogout();
}

/**
 * Universal API Request Wrapper
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    // If unauthorized, clear token and redirect
    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
      clearAuth();
      showToast('Session expired. Please log in again.', 'error');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 800);
      throw new Error('Unauthorized');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Toast notification system
 */
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Signal Status Badge Generator
 */
function getBadgeHtml(status) {
  const s = status || 'Unknown';
  let badgeClass = 'badge-fair';
  if (s === 'Strong') badgeClass = 'badge-strong';
  else if (s === 'Good') badgeClass = 'badge-good';
  else if (s === 'Fair') badgeClass = 'badge-fair';
  else if (s === 'Weak') badgeClass = 'badge-weak';
  else if (s === 'Very Weak') badgeClass = 'badge-veryweak';

  return `<span class="badge ${badgeClass}">${s}</span>`;
}

/**
 * Dynamic Navbar Rendering
 */
function renderNavbar(activePage = '') {
  const navContainer = document.getElementById('appNavbar');
  if (!navContainer) return;

  const user = getUser();
  const isAuth = !!user;

  navContainer.innerHTML = `
    <nav class="navbar">
      <a href="${isAuth ? 'dashboard.html' : 'index.html'}" class="nav-brand">
        <span class="icon-wifi"><i class="fa-solid fa-wifi"></i></span>
        <span>Wi-Fi Signal Mapper</span>
      </a>

      ${
        isAuth
          ? `
        <ul class="nav-links">
          <li><a href="dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}"><i class="fa-solid fa-chart-pie"></i> Dashboard</a></li>
          <li><a href="measurements.html" class="${activePage === 'measurements' ? 'active' : ''}"><i class="fa-solid fa-list-check"></i> Measurements</a></li>
          <li><a href="heatmap.html" class="${activePage === 'heatmap' ? 'active' : ''}"><i class="fa-solid fa-fire-flame-curved"></i> Heatmap</a></li>
          <li><a href="reports.html" class="${activePage === 'reports' ? 'active' : ''}"><i class="fa-solid fa-file-lines"></i> Reports</a></li>
          <li><a href="profile.html" class="${activePage === 'profile' ? 'active' : ''}"><i class="fa-solid fa-user-gear"></i> Profile</a></li>
        </ul>

        <div class="nav-user">
          <span class="user-badge"><i class="fa-solid fa-circle-user"></i> ${user.username || 'User'}</span>
          <button id="navLogoutBtn" class="btn btn-secondary btn-sm" onclick="logout()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Logout</button>
        </div>
      `
          : `
        <ul class="nav-links">
          <li><a href="index.html" class="${activePage === 'home' ? 'active' : ''}"><i class="fa-solid fa-house"></i> Home</a></li>
          <li><a href="login.html" class="${activePage === 'login' ? 'active' : ''}"><i class="fa-solid fa-right-to-bracket"></i> Login</a></li>
          <li><a href="register.html" class="${activePage === 'register' ? 'active' : ''}"><i class="fa-solid fa-user-plus"></i> Register</a></li>
        </ul>
      `
      }
    </nav>
  `;
}

/**
 * Setup Show/Hide Password Toggle
 * Works either on specific IDs or automatically on all elements with .password-toggle-btn
 * @param {string} [toggleBtnId] - ID of the toggle button (optional)
 * @param {string} [inputId] - ID of the password input (optional)
 */
function setupPasswordToggle(toggleBtnId, inputId) {
  function attachToggle(btn, input) {
    if (btn._hasPasswordToggle) return;
    btn._hasPasswordToggle = true;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPassword = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPassword ? 'text' : 'password');

      const eyeIcon = btn.querySelector('.eye-icon');
      const eyeOffIcon = btn.querySelector('.eye-off-icon');

      if (eyeIcon && eyeOffIcon) {
        eyeIcon.style.display = isPassword ? 'none' : 'inline-block';
        eyeOffIcon.style.display = isPassword ? 'inline-block' : 'none';
      }

      const label = isPassword ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      input.focus();
    });
  }

  if (toggleBtnId && inputId) {
    const btn = document.getElementById(toggleBtnId);
    const input = document.getElementById(inputId);
    if (btn && input) attachToggle(btn, input);
    return;
  }

  // Automatic binding for all password-input-wrappers
  const wrappers = document.querySelectorAll('.password-input-wrapper');
  wrappers.forEach(wrapper => {
    const input = wrapper.querySelector('input');
    const btn = wrapper.querySelector('.password-toggle-btn');
    if (input && btn) {
      attachToggle(btn, input);
    }
  });
}

// Auto-initialize toggles when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setupPasswordToggle());
} else {
  setupPasswordToggle();
}
