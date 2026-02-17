/*************************************************
 * WFMS – Frontend Logic (Updated)
 * Backend: Node.js + Express + MySQL
 *************************************************/

/* ========= HELPERS ========= */
const qs = (id) => document.getElementById(id);
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k, d) => {
  try {
    const raw = localStorage.getItem(k);
    if (raw === null || raw === undefined) return d;
    try {
      return JSON.parse(raw);
    } catch (e) {
      // Value wasn't JSON (saved directly as plain string) — return raw
      return raw;
    }
  } catch (err) {
    console.warn('LocalStorage read error for', k, err);
    return d;
  }
};

/* ========= STORAGE KEYS (UI STATE ONLY) ========= */
const CURRENT_KEY = 'wfms_current_user';
const TOKEN_KEY = 'wfms_token';
const REFRESH_TOKEN_KEY = 'wfms_refresh_token';
const TOKEN_EXPIRES_KEY = 'wfms_token_expires';
const THEME_KEY = 'wfms_theme';

/* ========= JWT TOKEN MANAGEMENT ========= */
function saveToken(token, refreshToken, expiresIn) {
  save(TOKEN_KEY, token);
  save(REFRESH_TOKEN_KEY, refreshToken);
  const expiresAt = Date.now() + (expiresIn * 1000);
  save(TOKEN_EXPIRES_KEY, expiresAt);
}

function getToken() {
  return load(TOKEN_KEY, null);
}

function getRefreshToken() {
  return load(REFRESH_TOKEN_KEY, null);
}

function isTokenExpired() {
  const expiresAt = load(TOKEN_EXPIRES_KEY, 0);
  // Refresh if expires in less than 1 hour
  return Date.now() + 3600000 > expiresAt;
}

async function refreshAccessToken() {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      console.warn('No refresh token available');
      return false;
    }

    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!res.ok) {
      console.warn('Token refresh failed');
      return false;
    }

    const data = await res.json();
    if (data.ok && data.token) {
      save(TOKEN_KEY, data.token);
      const expiresAt = Date.now() + (data.expiresIn * 1000);
      save(TOKEN_EXPIRES_KEY, expiresAt);
      console.log('✓ Token refreshed successfully');
      return true;
    }
    return false;
  } catch (err) {
    console.error('❌ Token refresh error:', err);
    return false;
  }
}

function clearSession() {
  localStorage.removeItem(CURRENT_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_KEY);
}

/* ========= API HELPER ========= */
async function api(url, method = 'GET', body) {
  try {
    // Check and refresh token if needed
    if (isTokenExpired()) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        console.warn('Unable to refresh token, user may need to login again');
      }
    }

    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (res.status === 401) {
      console.error('Unauthorized - clearing session');
      clearSession();
      window.location.href = '/';
      return { ok: false, error: 'Session expired. Please login again.' };
    }

    if (!res.ok) {
      console.warn(`⚠️ API ${method} ${url} returned status ${res.status}`);
    }
    
    const data = await res.json();
    console.log(`✓ API ${method} ${url}:`, data);
    return data;
  } catch (err) {
    console.error(`❌ API Error ${method} ${url}:`, err);
    return { ok: false, error: err.message };
  }
}



/* ========= THEME ========= */
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  const light = document.body.classList.contains('light-theme');
  const svg = qs('themeSvg');
  if (light) {
    svg.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    svg.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  qs('themeText').innerText = light ? 'Light' : 'Dark';
  localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
}

(function applyTheme() {
  if (localStorage.getItem(THEME_KEY) === 'light') {
    document.body.classList.add('light-theme');
    const svg = qs('themeSvg');
    svg.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    qs('themeText').innerText = 'Light';
  }
})();

/* ========= SESSION RECOVERY ========= */
(function recoverSession() {
  console.log('🔄 Checking for existing session...');
  const user = load(CURRENT_KEY, null);
  const token = getToken();
  
  if (user && token && !isTokenExpired()) {
    console.log('✓ Valid session found, restoring user:', user.name);
    setTimeout(() => enterDashboard(user), 500);
  } else if (user && token && getRefreshToken()) {
    console.log('⏱️ Token expired but refresh token available, attempting refresh...');
    refreshAccessToken().then(success => {
      if (success) {
        setTimeout(() => enterDashboard(user), 500);
      } else {
        console.log('ℹ️ Auto-refresh failed, showing login screen');
      }
    });
  } else {
    console.log('ℹ️ No valid session found');
  }
})();

/* ========= SOCKET.IO REAL-TIME NOTIFICATIONS ========= */
let socket = null;

function initializeSocket() {
  if (socket) return;
  
  socket = io();
  
  socket.on('connected', (data) => {
    console.log('✓ Connected to notification server:', data.message);
  });

  socket.on('notification', (data) => {
    console.log('📬 Notification received:', data);
    showNotification(data);
  });

  socket.on('disconnect', () => {
    console.warn('⚠️ Disconnected from notification server');
  });
}

function registerUserForNotifications(userId) {
  if (!socket) {
    initializeSocket();
  }
  socket.emit('register-user', userId);
  console.log('✓ User registered for notifications:', userId);
}

function showNotification(data) {
  const panel = qs('notificationsPanel');
  if (!panel) return;

  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification-item notification-${data.type}`;
  notification.innerHTML = `
    <div class="notification-header">
      <strong>${data.type === 'task_assigned' ? '📋 New Task' : data.type === 'approval_status' ? '✓ Task Update' : 'ℹ️ Notification'}</strong>
      <button class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
    </div>
    <div class="notification-body">
      ${data.message}
      ${data.taskId ? `<div class="notification-actions"><button class="btn btn-sm btn-primary" onclick="viewTask(${data.taskId})">View Task</button></div>` : ''}
    </div>
  `;

  panel.classList.remove('hidden');
  panel.insertBefore(notification, panel.firstChild);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 10000);

  // Show browser notification if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('WFMS - ' + (data.type === 'task_assigned' ? 'New Task' : 'Update'), {
      body: data.message,
      icon: '/icons/favicon.png'
    });
  }
}

// Request notification permission on first login
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ========= FIREBASE INITIALIZATION ========= */
let firebaseApp = null;
let firebaseAuth = null;

async function initializeFirebase() {
  try {
    // Fetch Firebase config from backend
    const configRes = await fetch('/config');
    const firebaseConfig = await configRes.json();
    
    // Check if we have valid Firebase config
    const hasValidConfig = firebaseConfig.apiKey && firebaseConfig.projectId;
    
    if (!hasValidConfig) {
      console.warn('⚠️ Firebase config not available');
      return false;
    }

    // Initialize Firebase
    if (typeof firebase !== 'undefined') {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth(firebaseApp);
      
      // Enable Google as an auth provider
      const googleProvider = new firebase.auth.GoogleAuthProvider();
      googleProvider.addScope('profile');
      googleProvider.addScope('email');
      
      console.log('✓ Firebase initialized successfully');
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Firebase initialization warning:', err.message);
    return false;
  }
}

// Initialize Firebase on page load
(async function() {
  await initializeFirebase();
})();

/* ========= CUSTOM AUTH ========= */
let auth = null;

// Custom authentication using backend API
/* ========= CUSTOM LOGIN ========= */
window.login = async function () {
  const emailInput = qs('username'); // Email field
  const passwordInput = qs('password');
  
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!email) {
    showFormError(emailInput, 'Email is required');
    return;
  }
  
  if (!password) {
    showFormError(passwordInput, 'Password is required');
    return;
  }

  // Add loading state
  const loginBtn = document.querySelector('#login-container .btn-primary');
  const originalText = loginBtn.innerHTML;
  loginBtn.classList.add('loading');
  loginBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Signing in...';

  try {
    console.log('🔐 Attempting login:', email);
    
    const data = await api('/api/login', 'POST', {
      email: email,
      password: password
    });

    console.log('📨 Login response:', data);

    if (!data.ok) {
      console.error('❌ Login failed:', data.error);
      showFormError(emailInput, data.error || 'Login failed');
      return;
    }

    if (!data.user) {
      console.error('❌ No user data in response');
      showFormError(emailInput, 'Invalid server response');
      return;
    }

    console.log('✓ Login successful for user:', data.user.name);
    showFormSuccess(emailInput);
    
    const user = {
      id: data.user.id,
      name: data.user.name || email,
      email: data.user.email,
      role: data.user.role
    };

    // Save user info and tokens
    save(CURRENT_KEY, user);
    if (data.token && data.refreshToken) {
      saveToken(data.token, data.refreshToken, data.expiresIn);
      console.log('✓ Tokens saved to localStorage');
    }
    console.log('✓ User saved to localStorage:', user);
    
    setTimeout(() => enterDashboard(user), 500);
  } catch (err) {
    console.error('❌ Login error:', err);
    showFormError(emailInput, 'Connection error. Please try again.');
  } finally {
    loginBtn.classList.remove('loading');
    loginBtn.innerHTML = originalText;
  }
};

/* ========= GOOGLE LOGIN ========= */
window.loginWithGoogle = async function () {
  try {
    if (!firebaseAuth) {
      console.error('Firebase not initialized');
      return;
    }

    const googleBtn = document.querySelector('button[onclick="loginWithGoogle()"]');
    if (!googleBtn) return;
    
    const originalText = googleBtn.innerHTML;
    googleBtn.classList.add('loading');
    googleBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Signing in...';

    // Sign in with Google popup
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    
    const result = await firebaseAuth.signInWithPopup(provider);
    const user = result.user;
    
    console.log('✓ Google sign-in successful:', user.email);

    // Get Firebase ID token
    const idToken = await user.getIdToken();
    
    // Create or update user in our backend using the Firebase token
    const data = await api('/api/auth/google', 'POST', {
      idToken: idToken,
      email: user.email,
      name: user.displayName || 'Google User'
    });

    console.log('📨 Google auth response:', data);

    if (!data.ok) {
      console.error('❌ Google auth failed:', data.error);
      showFormError(googleBtn, data.error || 'Google sign-in failed');
      googleBtn.classList.remove('loading');
      googleBtn.innerHTML = originalText;
      return;
    }

    console.log('✓ Google account login successful');
    showFormSuccess(googleBtn);
    
    const userData = {
      id: data.userId,
      name: data.name || user.displayName,
      email: user.email,
      role: data.role || 'worker'
    };

    // Save user info and tokens
    save(CURRENT_KEY, userData);
    if (data.token && data.refreshToken) {
      saveToken(data.token, data.refreshToken, data.expiresIn);
      console.log('✓ Google tokens saved');
    }
    
    setTimeout(() => enterDashboard(userData), 500);
  } catch (err) {
    console.error('❌ Google login error:', err);
    const googleBtn = document.querySelector('button[onclick="loginWithGoogle()"]');
    if (googleBtn) {
      if (err.code === 'auth/popup-closed-by-user') {
        showFormError(googleBtn, 'Sign-in cancelled');
      } else if (err.code === 'auth/popup-blocked') {
        showFormError(googleBtn, 'Pop-up was blocked. Please enable pop-ups for this site.');
      } else {
        showFormError(googleBtn, 'Google sign-in failed. Please try again.');
      }
    }
  } finally {
    const googleBtn = document.querySelector('button[onclick="loginWithGoogle()"]');
    if (googleBtn) {
      googleBtn.classList.remove('loading');
      const originalText = '<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google';
      googleBtn.innerHTML = originalText;
    }
  }
};

/* ========= EMAIL VALIDATION ========= */
async function checkEmailExists(email) {
  try {
    const data = await api('/api/check-email', 'POST', { email });
    return data.exists || false;
  } catch (err) {
    console.error('Error checking email:', err);
    return false;
  }
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/* ========= CUSTOM REGISTER ========= */
window.register = async function () {
  const nameInput = qs('regUsername');
  const emailInput = qs('regEmail');
  const passwordInput = qs('regPassword');
  const roleSelect = qs('regRole');
  
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleSelect.value;

  if (!name) {
    showFormError(nameInput, 'Full name is required');
    return;
  }

  if (!email) {
    showFormError(emailInput, 'Email is required');
    return;
  }

  if (!isValidEmail(email)) {
    showFormError(emailInput, 'Please enter a valid email address');
    return;
  }

  if (!password || password.length < 6) {
    showFormError(passwordInput, 'Password must be at least 6 characters');
    return;
  }

  // Add loading state
  const registerBtn = document.querySelector('#register-container .btn-success');
  const originalText = registerBtn.innerHTML;
  registerBtn.classList.add('loading');
  registerBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Checking email...';

  try {
    console.log('👤 Checking if email exists:', email);
    
    // Check if email already exists
    const emailExists = await checkEmailExists(email);
    if (emailExists) {
      showFormError(emailInput, 'Email already registered. Please login or use a different email.');
      registerBtn.classList.remove('loading');
      registerBtn.innerHTML = originalText;
      return;
    }

    console.log('✓ Email is available. Creating account...');
    registerBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Creating Account...';
    
    const data = await api('/api/signup', 'POST', {
      name: name,
      email: email,
      password: password,
      role: role === 'admin' ? 'admin' : 'worker'
    });

    console.log('📨 Registration response:', data);

    if (!data.ok) {
      console.error('❌ Registration failed:', data.error);
      // Handle different error types
      if (data.error.includes('already registered') || data.error.includes('Email already')) {
        showFormError(emailInput, data.error);
      } else if (data.error.includes('Invalid email')) {
        showFormError(emailInput, data.error);
      } else {
        showFormError(nameInput, data.error || 'Registration failed');
      }
      return;
    }

    console.log('✓ Account created successfully');
    showFormSuccess(nameInput);
    
    // Clear form
    nameInput.value = '';
    emailInput.value = '';
    passwordInput.value = '';
    roleSelect.value = 'employee';
    
    // Show success message and generate QR for user
    setTimeout(() => {
      // Generate and display QR code for new user
      showQrAfterSignup({
        userId: data.userId,
        name: name,
        email: email,
        role: role === 'admin' ? 'admin' : 'worker'
      });
    }, 500);
  } catch (err) {
    console.error('❌ Registration failed:', err.message);
    showFormError(nameInput, 'Connection error. Please try again.');
  } finally {
    registerBtn.classList.remove('loading');
    registerBtn.innerHTML = originalText;
  }
};

// Toggle registration password visibility
window.toggleRegPassword = function () {
  const pwd = qs('regPassword');
  const icon = qs('regPasswordIcon');
  if (!pwd) return;
  if (pwd.type === 'password') {
    pwd.type = 'text';
    if (icon) icon.className = 'bi bi-eye-slash';
    const btn = qs('regPasswordToggle');
    if (btn) { btn.setAttribute('aria-label', 'Hide password'); btn.title = 'Hide password'; }
  } else {
    pwd.type = 'password';
    if (icon) icon.className = 'bi bi-eye';
    const btn = qs('regPasswordToggle');
    if (btn) { btn.setAttribute('aria-label', 'Show password'); btn.title = 'Show password'; }
  }
};

// Show QR code after signup
window.showQrAfterSignup = async function(userData) {
  const { userId, name, email, role } = userData;
  
  try {
    console.log('📱 Generating QR code for user:', userId);
    
    // Call new QR generation endpoint
    const qrResponse = await api('/api/generate-user-qr', 'POST', {
      userId: userId,
      email: email,
      name: name
    });
    
    if (!qrResponse.ok) {
      console.error('QR generation error:', qrResponse.error);
      alert('Account created successfully!\n\nPlease sign in with your email and password.');
      backToLogin();
      return;
    }

    // Display professional QR modal
    showQrModal({
      qrData: qrResponse.qrData,
      qrToken: qrResponse.qrToken,
      userId: userId,
      userName: name,
      userEmail: email,
      userRole: role
    });
    
    console.log('✓ QR code displayed for user:', userId);
  } catch (err) {
    console.error('QR generation error:', err);
    alert('Account created! Please sign in with your email and password.');
    backToLogin();
  }
};

// Show professional QR code modal
window.showQrModal = function(qrInfo) {
  const { qrData, qrToken, userId, userName, userEmail, userRole } = qrInfo;
  
  // Create modal HTML
  const modalHTML = `
    <div class="qr-modal-overlay" id="qrModal" onclick="closeQrModal()">
      <div class="qr-modal-container" onclick="event.stopPropagation()">
        <!-- Header -->
        <div class="qr-modal-header">
          <h2>🔐 Your Unique QR Code</h2>
          <button class="btn-close" onclick="closeQrModal()" aria-label="Close"></button>
        </div>
        
        <!-- Content -->
        <div class="qr-modal-body">
          <!-- User Info -->
          <div class="qr-user-info">
            <div class="user-detail">
              <span class="detail-label">Name:</span>
              <span class="detail-value">${userName}</span>
            </div>
            <div class="user-detail">
              <span class="detail-label">Email:</span>
              <span class="detail-value">${userEmail}</span>
            </div>
            <div class="user-detail">
              <span class="detail-label">Role:</span>
              <span class="detail-value badge badge-${userRole === 'admin' ? 'danger' : 'primary'}">${userRole.toUpperCase()}</span>
            </div>
          </div>
          
          <!-- QR Code -->
          <div class="qr-code-container">
            <img src="${qrData}" alt="User QR Code" class="qr-code-image" />
            <p class="qr-hint">Scan this code with your device to access your dashboard</p>
          </div>
          
          <!-- Instructions -->
          <div class="qr-instructions">
            <h4>📋 How to use your QR Code:</h4>
            <ol>
              <li>Download or save this QR code (click Download button)</li>
              <li>On your next login, you can scan this code instead of entering password</li>
              <li>The scan records date and time for security audit</li>
              <li>Keep this code safe as a second authentication factor</li>
            </ol>
          </div>
          
          <!-- Security Info -->
          <div class="qr-security-notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <div>
              <strong>🛡️ Security Information</strong>
              <p>Your QR code is unique and tied to your account. All scans are recorded with date/time and IP address for security audit purposes.</p>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="qr-modal-footer">
          <button class="btn btn-secondary" onclick="closeQrModal()">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 4 21 4 23 6 23 20a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6"></polyline>
              <line x1="10" y1="12" x2="14" y2="12"></line>
            </svg>
            Close
          </button>
          <button class="btn btn-primary" onclick="downloadQrCode('${qrData}', '${userName}')">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download QR Code
          </button>
          <button class="btn btn-success" onclick="goToLoginAfterQr()">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            I've Saved My QR Code
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal styles
  const style = document.createElement('style');
  style.textContent = `
    .qr-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.3s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .qr-modal-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      animation: slideUp 0.3s ease-out;
    }
    
    @keyframes slideUp {
      from { transform: translateY(30px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .qr-modal-header {
      padding: 24px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .qr-modal-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .qr-modal-body {
      padding: 24px;
    }
    
    .qr-user-info {
      background: #f3f4f6;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    
    .user-detail {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .user-detail:last-child {
      border-bottom: none;
    }
    
    .detail-label {
      font-weight: 600;
      color: #6b7280;
    }
    
    .detail-value {
      color: #1f2937;
      font-weight: 500;
    }
    
    .qr-code-container {
      text-align: center;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    
    .qr-code-image {
      max-width: 250px;
      border: 3px solid #0d6efd;
      border-radius: 8px;
      padding: 8px;
      background: white;
      margin-bottom: 12px;
    }
    
    .qr-hint {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }
    
    .qr-instructions {
      background: #eff6ff;
      border-left: 4px solid #0d6efd;
      padding: 16px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    
    .qr-instructions h4 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .qr-instructions ol {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      color: #4b5563;
      line-height: 1.6;
    }
    
    .qr-security-notice {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .qr-security-notice svg {
      width: 24px;
      height: 24px;
      color: #d97706;
      flex-shrink: 0;
    }
    
    .qr-security-notice strong {
      color: #92400e;
      font-size: 14px;
    }
    
    .qr-security-notice p {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #78350f;
      line-height: 1.5;
    }
    
    .qr-modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    
    .qr-modal-footer .btn {
      padding: 8px 16px;
      font-size: 14px;
      border-radius: 6px;
    }
    
    .btn-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .btn-close:hover {
      color: #1f2937;
    }
  `;
  
  document.head.appendChild(style);
  
  // Add modal to page
  let modalContainer = qs('qrModal');
  if (modalContainer) {
    modalContainer.remove();
  }
  
  const modal = document.createElement('div');
  modal.innerHTML = modalHTML;
  document.body.appendChild(modal.firstElementChild);
};

// Close QR modal
window.closeQrModal = function() {
  const modal = qs('qrModal');
  if (modal) {
    modal.style.animation = 'fadeOut 0.2s ease-out';
    setTimeout(() => modal.remove(), 200);
  }
};

// Download QR code as image
window.downloadQrCode = function(qrDataUrl, userName) {
  const link = document.createElement('a');
  link.href = qrDataUrl;
  link.download = `QR-Code-${userName}-${new Date().getTime()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  console.log('✓ QR code downloaded');
};

// After user confirms they saved QR code, go to login
window.goToLoginAfterQr = function() {
  closeQrModal();
  backToLogin();
};

// Handle QR scan for dashboard access
window.handleQrScan = async function(qrData) {
  try {
    console.log('📱 Processing QR scan...');
    
    // Parse QR data
    let qrInfo;
    if (typeof qrData === 'string') {
      try {
        qrInfo = JSON.parse(qrData);
      } catch (e) {
        console.warn('Could not parse QR as JSON, treating as token');
        qrInfo = { token: qrData };
      }
    } else {
      qrInfo = qrData;
    }
    
    const userId = qrInfo.userId || qrInfo.id;
    const qrToken = qrInfo.token;
    
    if (!userId || !qrToken) {
      alert('❌ Invalid QR code. Please scan a valid QR code.');
      return;
    }
    
    console.log('🔄 Recording QR scan with date/time...');
    
    // Record the scan on backend (this records date, time, and IP)
    const scanResponse = await api('/api/scan-qr', 'POST', {
      userId: userId,
      qrToken: qrToken
    });
    
    if (!scanResponse.ok) {
      alert('❌ QR code verification failed. Please scan again or sign in manually.');
      return;
    }
    
    console.log('✓ QR scan recorded:', scanResponse.scanTime);
    console.log('✓ Scan count:', scanResponse.scanCount);
    
    // Get user info and log them in
    const userResponse = await api('/api/users?id=' + userId);
    if (userResponse && userResponse.length > 0) {
      const user = userResponse[0];
      
      // Save user session
      save(CURRENT_KEY, user);
      
      // Generate a temporary token for QR scan based login
      const tempToken = jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        'qr-temp-key',
        { expiresIn: '7d' }
      );
      saveToken(tempToken, tempToken, 604800);
      
      console.log('✓ User authenticated via QR scan:', user.name);
      alert(`✓ Check-in successful!\nTime: ${new Date(scanResponse.scanTime).toLocaleString()}`);
      
      // Enter dashboard
      setTimeout(() => enterDashboard(user), 500);
      return;
    }
    
    alert('❌ User not found. Please sign in manually.');
  } catch (err) {
    console.error('QR scan error:', err);
    alert('❌ QR scan failed. Please sign in manually.');
  }
};

// Admin function to view all QR scan records
window.viewQrScanRecords = async function() {
  try {
    const user = load(CURRENT_KEY);
    if (!user || user.role !== 'admin') {
      alert('❌ Admin access required');
      return;
    }
    
    console.log('📊 Fetching QR scan records...');
    const records = await api('/api/admin/qr-scan-records');
    
    if (!records.ok) {
      alert('Error fetching records: ' + records.error);
      return;
    }
    
    // Display records in a modal
    showQrScanRecordsModal(records.records);
  } catch (err) {
    console.error('Error viewing scan records:', err);
    alert('Failed to load scan records');
  }
};

// Show professional modal with QR scan records
window.showQrScanRecordsModal = function(records) {
  const modalHTML = `
    <div class="qr-records-modal-overlay" id="qrRecordsModal" onclick="closeQrScanRecordsModal()">
      <div class="qr-records-modal-container" onclick="event.stopPropagation()">
        <!-- Header -->
        <div class="qr-modal-header">
          <h2>🔐 QR Code Scan Records</h2>
          <button class="btn-close" onclick="closeQrScanRecordsModal()" aria-label="Close"></button>
        </div>
        
        <!-- Content -->
        <div class="qr-records-modal-body">
          <div class="scan-records-summary">
            <div class="summary-card">
              <span class="summary-label">Total Scans</span>
              <span class="summary-value">${records.length}</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">Unique Users</span>
              <span class="summary-value">${new Set(records.map(r => r.userId)).size}</span>
            </div>
          </div>
          
          <div class="scan-records-table">
            <table>
              <thead>
                <tr>
                  <th>User Name</th>
                  <th>Email</th>
                  <th>Scan Time</th>
                  <th>Scanner IP</th>
                  <th>QR Status</th>
                  <th>Total Scans</th>
                </tr>
              </thead>
              <tbody>
                ${records.map(r => `
                  <tr>
                    <td>${r.userName}</td>
                    <td>${r.userEmail}</td>
                    <td>${r.scanTime}</td>
                    <td>${r.scannerIp}</td>
                    <td>
                      <span class="badge ${ r.qrActivated ? 'bg-success' : 'bg-warning' }">
                        ${r.qrActivated ? 'Activated' : 'Pending'}
                      </span>
                    </td>
                    <td>${r.totalScans}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="qr-modal-footer">
          <button class="btn btn-secondary" onclick="closeQrScanRecordsModal()">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 4 21 4 23 6 23 20a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6"></polyline>
            </svg>
            Close
          </button>
          <button class="btn btn-primary" onclick="exportQrScanRecords()">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
            </svg>
            Export as CSV
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  let modalContainer = qs('qrRecordsModal');
  if (modalContainer) {
    modalContainer.remove();
  }
  
  const modal = document.createElement('div');
  modal.innerHTML = modalHTML;
  document.body.appendChild(modal.firstElementChild);
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .qr-records-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    
    .qr-records-modal-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 900px;
      width: 95%;
      max-height: 85vh;
      overflow-y: auto;
    }
    
    .scan-records-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .summary-card {
      background: #f3f4f6;
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }
    
    .summary-label {
      display: block;
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .summary-value {
      display: block;
      font-size: 24px;
      font-weight: 700;
      color: #0d6efd;
    }
    
    .scan-records-table {
      overflow-x: auto;
    }
    
    .scan-records-table table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    
    .scan-records-table thead {
      background: #f3f4f6;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .scan-records-table th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
    }
    
    .scan-records-table td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      color: #1f2937;
    }
    
    .scan-records-table tbody tr:hover {
      background: #f9fafb;
    }
    
    .qr-modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
  `;
  document.head.appendChild(style);
};

// Close QR records modal
window.closeQrScanRecordsModal = function() {
  const modal = qs('qrRecordsModal');
  if (modal) {
    modal.remove();
  }
};

// Export QR scan records as CSV
window.exportQrScanRecords = async function() {
  try {
    const records = await api('/api/admin/qr-scan-records');
    if (!records.ok) return alert('Error exporting records');
    
    let csv = 'User Name,Email,Scan Time,Scanner IP,QR Status,Total Scans\n';
    records.records.forEach(r => {
      csv += `"${r.userName}","${r.userEmail}","${r.scanTime}","${r.scannerIp}","${r.qrActivated ? 'Activated' : 'Pending'}",${r.totalScans}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QR-Scan-Records-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    console.log('✓ Records exported as CSV');
  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to export records');
  }
};

function logout() {
  try {
    clearSession(); // This clears user, tokens, and expiration
    console.log('✓ User logged out and session cleared');
    showHome();
  } catch (err) {
    console.error('❌ Logout failed:', err);
  }
}

/* ========= DASHBOARD ========= */
function enterDashboard(user) {
  qs('auth-overlay').classList.add('hidden');
  qs('dashboard').classList.remove('hidden');
  qs('welcome').innerText = `Welcome, ${user.name}`;

  // Initialize real-time notifications
  initializeSocket();
  registerUserForNotifications(user.id);
  requestNotificationPermission();

  if (user.role === 'admin') {
    qs('admin-panel').classList.remove('hidden');
    qs('worker-panel').classList.add('hidden');
    loadEmployees();
    loadAdminDashboard();
    initializeAdminApprovalPanel();
  } else {
    qs('admin-panel').classList.add('hidden');
    qs('worker-panel').classList.remove('hidden');
    loadWorkerDashboard(user);
  }

  renderTasks();
}

/* ========= TASKS ========= */

// ❌ OLD LOCAL TASK SOURCE (DISABLED)
/*
const tasks = load('tasks', []);
*/

async function fetchTasks() {
  return await api('/api/tasks');
}

async function renderTasks() {
  const list = qs('taskList');
  list.innerHTML = '';

  const tasks = await fetchTasks();
  const user = load(CURRENT_KEY);

  tasks
    .filter(t => user.role === 'admin' || t.assigned_to === user.id)
    .forEach(t => {
      const div = document.createElement('div');
      div.className = 'task-item';
      div.innerHTML = `
        <strong>${t.title}</strong>
        <p>${t.description || ''}</p>
        <span class="badge bg-${t.status === 'done' ? 'success' : 'secondary'}">
          ${t.status || 'pending'}
        </span>
      `;
      list.appendChild(div);
    });

  qs('totalTasks').innerText = tasks.length;
}

// ❌ OLD LOCAL ADD TASK (DISABLED)
/*
window.addTask = function () {};
*/

// ✅ BACKEND TASK CREATION
window.addTask = async function () {
  const title = qs('taskTitle').value.trim();
  const description = qs('taskDesc').value.trim();
  const assigned_to = qs('taskAssign').value;

  if (!title || !assigned_to) return alert('Missing fields');

  const data = await api('/api/tasks', 'POST', {
    title,
    description,
    assigned_to
  });

  if (!data.ok) return alert(data.error);

  // Clear form
  qs('taskTitle').value = '';
  qs('taskDesc').value = '';
  qs('taskAssign').value = '';

  renderTasks();
  alert('✓ Task assigned successfully!');
};

/* ========= ENHANCED TASK MANAGEMENT ========= */

// Start working on a task
window.startTask = async function (taskId) {
  const confirmed = confirm('Start working on this task?');
  if (!confirmed) return;

  // Since we don't have an update endpoint yet, we'll show a message
  // In Phase E, we'll implement full task status updates
  const user = load(CURRENT_KEY);
  const tasks = await api('/api/tasks');
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) return alert('Task not found');

  console.log('📝 Starting task:', task.title);
  alert(`✓ Started working on: ${task.title}\n\nYou can now submit a daily report when done.`);
  
  // Show report modal
  openTaskReport(taskId, task.title);
};

// Open task report submission modal
window.openTaskReport = function (taskId, taskTitle) {
  // Create modal if it doesn't exist
  let modal = qs('taskReportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'taskReportModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h5>Submit Daily Report</h5>
          <button class="btn-close" onclick="closeTaskReport()"></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Task</label>
            <input type="text" id="reportTaskTitle" class="form-control" readonly />
          </div>
          <div class="form-group">
            <label class="form-label">Work Completed</label>
            <textarea id="reportContent" class="form-control" placeholder="Describe what you've done..." rows="5"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="reportStatus" class="form-control">
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Hours Spent</label>
            <input type="number" id="reportHours" class="form-control" placeholder="0.5" step="0.5" min="0" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeTaskReport()">Cancel</button>
          <button class="btn btn-primary" onclick="submitTaskReport(${taskId})">Submit Report</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Set task title
  qs('reportTaskTitle').value = taskTitle;
  qs('reportContent').value = '';
  qs('reportStatus').value = 'in-progress';
  qs('reportHours').value = '';
  
  // Show modal
  modal.style.display = 'block';
};

window.closeTaskReport = function () {
  const modal = qs('taskReportModal');
  if (modal) modal.style.display = 'none';
};

// Submit task report to admin for approval
window.submitTaskReport = async function (taskId) {
  const content = qs('reportContent').value.trim();
  const status = qs('reportStatus').value;
  const hours = parseFloat(qs('reportHours').value) || 0;

  if (!content) {
    alert('Please describe your work');
    return;
  }

  const user = load(CURRENT_KEY);
  
  const data = await api('/api/tasks/' + taskId + '/submit-report', 'POST', {
    daily_report: content,
    status: status,
    hours_spent: hours,
    submitted_by: user.id
  });

  if (!data.ok) {
    alert('Error: ' + data.error);
    return;
  }

  console.log('✓ Report submitted for approval');
  alert('✓ Daily report submitted to admin for review. You\'ll be notified when they respond.');
  
  closeTaskReport();
  renderTasks();
  loadWorkerDashboard(user);
};

/* ========= EMPLOYEES (ADMIN) ========= */
async function loadEmployees() {
  const data = await api('/api/users');
  const select = qs('taskAssign');
  const list = qs('employeeList');

  select.innerHTML = '';
  list.innerHTML = '';

  data.forEach(u => {
    if (u.role !== 'worker') return;

    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    select.appendChild(opt);

    const div = document.createElement('div');
    div.className = 'employee-card';
    div.innerHTML = `
      <div class="employee-avatar" style="width: 40px; height: 40px; background: #2563eb; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin: 0 auto 8px;">
        ${u.name.charAt(0).toUpperCase()}
      </div>
      <div>${u.name}</div>
      <div style="font-size: 12px; color: #94a3b8;">Employee</div>
    `;
    list.appendChild(div);
  });

  qs('totalEmployees').innerText = data.length;
}

async function loadAdminDashboard() {
  // Load performance data if available
  const tasks = await api('/api/tasks');
  const completed = tasks.filter(t => t.status === 'completed').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  
  // Update admin dashboard stats
  const adminStats = document.querySelector('.admin-stats');
  if (adminStats) {
    adminStats.innerHTML = `
      <div class="stat-box">
        <div class="stat-label">Total Tasks</div>
        <div class="stat-number">${tasks.length}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">In Progress</div>
        <div class="stat-number" style="color: #fbbf24;">${inProgress}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Pending</div>
        <div class="stat-number" style="color: #ef4444;">${pending}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Completed</div>
        <div class="stat-number" style="color: #10b981;">${completed}</div>
      </div>
    `;
  }
  
  // Initialize performance chart
  await initializePerformanceChart();
  
  logUI(`✓ Admin Dashboard loaded: ${completed} completed, ${pending} pending, ${inProgress} in progress`);
}

async function loadWorkerDashboard(user) {
  // Load worker's assigned tasks
  const tasks = await api('/api/tasks');
  const myTasks = tasks.filter(t => t.assigned_to === user.id);
  const completed = myTasks.filter(t => t.status === 'completed').length;
  const pending = myTasks.length - completed;

  // Update worker stats
  const workerStats = document.querySelector('.worker-stats');
  if (workerStats) {
    workerStats.innerHTML = `
      <div class="worker-stat-box">
        <div class="stat-label">Tasks Completed</div>
        <div class="stat-number">${completed}</div>
      </div>
      <div class="worker-stat-box">
        <div class="stat-label">Tasks Pending</div>
        <div class="stat-number">${pending}</div>
      </div>
      <div class="worker-stat-box">
        <div class="stat-label">Total Tasks</div>
        <div class="stat-number">${myTasks.length}</div>
      </div>
      <div class="worker-stat-box">
        <div class="stat-label">Completion Rate</div>
        <div class="stat-number">${myTasks.length > 0 ? Math.round((completed / myTasks.length) * 100) : 0}%</div>
      </div>
    `;
  }

  // Load worker's my tasks
  const myTaskList = qs('myTaskList');
  myTaskList.innerHTML = '';

  if (myTasks.length === 0) {
    const noTasksMsg = qs('noTasksMsg');
    if (noTasksMsg) noTasksMsg.style.display = 'block';
  } else {
    const noTasksMsg = qs('noTasksMsg');
    if (noTasksMsg) noTasksMsg.style.display = 'none';
    
    myTasks.forEach(t => {
      const taskEl = document.createElement('div');
      taskEl.className = `task-item status-${t.status}`;
      taskEl.innerHTML = `
        <div style="flex: 1;">
          <div class="task-title">${t.title}</div>
          <div class="task-status-badge">${t.status.replace('-', ' ').toUpperCase()}</div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          ${t.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="startTask(${t.id})">Start</button>` : ''}
          ${t.status === 'in-progress' ? `<button class="btn btn-sm btn-success" onclick="openTaskReport(${t.id}, '${t.title}')">Submit Report</button>` : ''}
          ${t.status === 'completed' ? `<span class="badge bg-success">✓ Approved</span>` : ''}
        </div>
      `;
      myTaskList.appendChild(taskEl);
    });
  }

  logUI('✓ Worker Dashboard loaded: ' + myTasks.length + ' tasks');
}

/* ========= ATTENDANCE ========= */
async function clockIn() {
  await api('/api/time', 'POST', {
    user_id: load(CURRENT_KEY).id,
    action: 'clock_in',
    time: new Date().toISOString()
  });
  logUI('Clock In');
}

async function breakStart() {
  await api('/api/time', 'POST', {
    user_id: load(CURRENT_KEY).id,
    action: 'break_start',
    time: new Date().toISOString()
  });
  logUI('Break Start');
}

async function breakEnd() {
  await api('/api/time', 'POST', {
    user_id: load(CURRENT_KEY).id,
    action: 'break_end',
    time: new Date().toISOString()
  });
  logUI('Break End');
}

async function clockOut() {
  await api('/api/time', 'POST', {
    user_id: load(CURRENT_KEY).id,
    action: 'clock_out',
    time: new Date().toISOString()
  });
  logUI('Clock Out');
}

/* ========= LOGS (UI ONLY) ========= */
function logUI(msg) {
  const log = qs('log');
  const p = document.createElement('p');
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  log.prepend(p);
  qs('totalLogs').innerText = log.children.length;
}

/* ========= AUTH UI ========= */
function showRegister() {
  const loginContainer = qs('login-container');
  const registerContainer = qs('register-container');
  
  loginContainer.classList.add('hidden');
  // Reset animation by removing and re-adding
  registerContainer.classList.remove('form-animate');
  void registerContainer.offsetWidth; // Trigger reflow
  registerContainer.classList.remove('hidden');
  registerContainer.classList.add('form-animate');
  
  // Re-animate form elements with stagger
  document.querySelectorAll('#register-container .form-group-animate, #register-container .btn-animate, #register-container .link-animate').forEach(el => {
    el.style.animation = 'none';
    void el.offsetWidth; // Trigger reflow
    el.style.animation = '';
  });
}

function backToLogin() {
  const loginContainer = qs('login-container');
  const registerContainer = qs('register-container');
  
  registerContainer.classList.add('hidden');
  // Reset animation by removing and re-adding
  loginContainer.classList.remove('form-animate');
  void loginContainer.offsetWidth; // Trigger reflow
  loginContainer.classList.remove('hidden');
  loginContainer.classList.add('form-animate');
  
  // Re-animate form elements with stagger
  document.querySelectorAll('#login-container .form-group-animate, #login-container .btn-animate, #login-container .link-animate').forEach(el => {
    el.style.animation = 'none';
    void el.offsetWidth; // Trigger reflow
    el.style.animation = '';
  });
}

/* ========= FORM VALIDATION FEEDBACK ===== */
function showFormError(inputElement, message) {
  // Remove existing error messages
  const existingError = inputElement.parentElement.querySelector('.form-error');
  if (existingError) existingError.remove();
  
  inputElement.classList.add('error');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'form-error';
  errorDiv.textContent = message;
  inputElement.parentElement.appendChild(errorDiv);
  
  console.log('❌ Form Error:', message);
  
  setTimeout(() => {
    inputElement.classList.remove('error');
    errorDiv.remove();
  }, 4000);
}

function showFormSuccess(inputElement) {
  // Remove existing success indicators
  const existingSuccess = inputElement.parentElement.querySelector('.form-success');
  if (existingSuccess) existingSuccess.remove();
  
  inputElement.classList.add('success');
  const successDiv = document.createElement('div');
  successDiv.className = 'form-success';
  successDiv.textContent = '✓ Success';
  inputElement.parentElement.appendChild(successDiv);
  
  console.log('✓ Form Success');
  
  setTimeout(() => {
    inputElement.classList.remove('success');
    successDiv.remove();
  }, 2500);
}

/* ========= INIT ========= */
(function init() {
  const user = load(CURRENT_KEY);
  if (user) enterDashboard(user);
})();

// Don't forget to call this function when your app initializes!
// For example, at the end of your your-app-script.js file
// setupAuthObserver();
// your-app-script.js

// --- Helper functions to update UI messages ---
function showMessage(elementId, message, type) {
    const el = document.getElementById(elementId);
    el.innerText = message;
    el.className = `message ${type}`;
    setTimeout(() => { el.innerText = ''; el.className = 'message'; }, 5000); // Clear after 5s
}

// --- Firebase Firestore Functions (from previous steps) ---
// getUserProfile
async function getUserProfile() {
    const user = auth.currentUser;
    if (user) {
        try {
            const docRef = db.collection("users").doc(user.uid);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                console.log("User profile data:", docSnap.data());
                return docSnap.data();
            } else {
                console.log("No such document for user:", user.uid);
                return null;
            }
        } catch (error) {
            console.error("Error getting user profile document:", error);
            throw error;
        }
    }
    return null;
}

// saveUserProfile
async function saveUserProfile(displayName, department) {
    // Profile management function - integrate with backend as needed
    const user = load(CURRENT_KEY);
    if (user) {
        console.log('Profile update would be sent to backend:', { displayName, department });
        logUI('Profile updated');
    } else {
        console.warn("No user is currently logged in to save profile.");
    }
}


// UI Update Logic (connected to auth state)
function updateProfileUI() {
    const user = load(CURRENT_KEY);
    if (user) {
        // Update profile UI with logged-in user data
        console.log('User profile loaded:', user);
    }
}

// Update App UI based on authentication state
function updateAppUI(user) {
    if (user) {
        console.log('User authenticated:', user.username);
    }
}

/* ========= ADMIN APPROVAL PANEL ========= */
async function initializeAdminApprovalPanel() {
  try {
    const data = await api('/api/admin/pending-approvals', 'GET');
    if (!Array.isArray(data)) return;

    const approvalPanel = document.querySelector('[data-approval-panel]') || createApprovalPanel();
    approvalPanel.innerHTML = '';

    if (data.length === 0) {
      approvalPanel.innerHTML = '<div class="alert alert-info" style="margin: 0;">✓ No pending tasks - All task reports have been reviewed!</div>';
      return;
    }

    const header = document.createElement('div');
    header.className = 'alert alert-warning' ;
    header.style.cssText = 'margin-bottom: 1rem; margin-top: 0';
    header.innerHTML = `📋 <strong>${data.length} pending task report(s) awaiting your review</strong>`;
    approvalPanel.appendChild(header);

    data.forEach((task, index) => {
      const item = document.createElement('div');
      item.className = 'approval-item card';
      item.style.cssText = 'margin-bottom: 1rem; border-left: 4px solid #3b82f6';
      
      const submittedDate = new Date(task.submitted_at).toLocaleString();
      
      item.innerHTML = `
        <div class="card-body">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <h6 class="card-title" style="margin: 0;">📝 ${task.title}</h6>
            <span style="background-color: #3b82f6; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">
              ${index + 1} of ${data.length}
            </span>
          </div>
          <p class="text-muted" style="font-size: 0.875rem; margin: 0.5rem 0;"><small>👤 Submitted by: <strong>${task.submitted_by_name}</strong> on ${submittedDate}</small></p>
          <div style="background-color: #f3f4f6; padding: 0.75rem; border-radius: 4px; margin: 0.75rem 0;">
            <p class="card-text" style="margin: 0; font-size: 0.925rem; white-space: pre-wrap;"><strong>Report:</strong> ${task.daily_report}</p>
          </div>
          <p class="text-muted" style="font-size: 0.875rem; margin: 0.5rem 0;"><small>⏱️ Hours Spent: <strong>${(task.hours_spent || 0).toFixed(1)} hrs</strong></small></p>
          <div class="btn-group" style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            <button class="btn btn-sm btn-success" onclick="approveTask(${task.id}, '${task.title.replace(/'/g, "\\'")}')">
              <svg style="width: 1rem; height: 1rem; display: inline; margin-right: 0.25rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Approve
            </button>
            <button class="btn btn-sm btn-danger" onclick="rejectTask(${task.id}, '${task.title.replace(/'/g, "\\'")}')">
              <svg style="width: 1rem; height: 1rem; display: inline; margin-right: 0.25rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Reject
            </button>
          </div>
        </div>
      `;
      approvalPanel.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading approval panel:', err);
  }
}

function createApprovalPanel() {
  const panel = document.createElement('div');
  panel.className = 'card section';
  panel.setAttribute('data-approval-panel', '');
  
  const header = document.createElement('div');
  header.className = 'card-header-custom';
  header.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
    <h5 class="mb-0">Pending Task Approvals</h5>
  `;
  
  panel.appendChild(header);
  
  const content = document.createElement('div');
  content.id = 'approvalPanel';
  panel.appendChild(content);
  
  const adminPanel = qs('admin-panel');
  if (adminPanel) {
    adminPanel.appendChild(panel);
  }
  
  return content;
}

window.approveTask = async function (taskId, taskTitle) {
  const feedback = prompt(`Approve task "${taskTitle}"? Add optional feedback:`);
  if (feedback === null) return; // User cancelled

  const data = await api(`/api/tasks/${taskId}/approve`, 'POST', { feedback: feedback || 'Approved' });
  
  if (!data.ok) {
    alert('Error: ' + data.error);
    return;
  }

  console.log('✓ Task approved:', taskTitle);
  alert(`✓ Task "${taskTitle}" has been approved. Employee will be notified.`);
  
  initializeAdminApprovalPanel();
  loadAdminDashboard();
};

window.rejectTask = async function (taskId, taskTitle) {
  const feedback = prompt(`Reject task "${taskTitle}"? Please provide feedback for revision:`);
  if (feedback === null) return; // User cancelled
  if (!feedback.trim()) {
    alert('Please provide feedback for rejection');
    return;
  }

  const data = await api(`/api/tasks/${taskId}/reject`, 'POST', { feedback });
  
  if (!data.ok) {
    alert('Error: ' + data.error);
    return;
  }

  console.log('✓ Task rejected:', taskTitle);
  alert(`✓ Task "${taskTitle}" has been rejected. Employee will need to revise and resubmit.`);
  
  initializeAdminApprovalPanel();
  loadAdminDashboard();
};

/* ========= PERFORMANCE CHART ========= */
let performanceChart = null;

async function initializePerformanceChart() {
  try {
    // Fetch performance data from API
    const performanceData = await api('/api/admin/performance-metrics', 'GET');
    if (!Array.isArray(performanceData) || performanceData.length === 0) {
      console.log('⚠ No performance data available');
      return;
    }

    // Get the canvas element
    const chartCanvas = qs('performanceChart');
    if (!chartCanvas) {
      console.log('⚠ Performance chart element not found');
      return;
    }

    const ctx = chartCanvas.getContext('2d');
    
    // Destroy previous chart if exists
    if (performanceChart) {
      performanceChart.destroy();
    }

    // Sort data by completion rate descending
    const sortedData = [...performanceData].sort((a, b) => (b.completion_rate || 0) - (a.completion_rate || 0));

    performanceChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sortedData.map(p => p.name),
        datasets: [
          {
            label: 'Completion Rate (%)',
            data: sortedData.map(p => p.completion_rate || 0),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.6)',
            borderWidth: 2,
            yAxisID: 'y'
          },
          {
            label: 'Tasks Completed',
            data: sortedData.map(p => p.tasks_completed || 0),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderWidth: 2,
            yAxisID: 'y1'
          },
          {
            label: 'Hours Worked',
            data: sortedData.map(p => p.total_hours_worked || 0),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.6)',
            borderWidth: 2,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Completion Rate (%)',
              color: '#10b981'
            },
            min: 0,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Tasks Completed',
              color: '#3b82f6'
            },
            grid: {
              drawOnChartArea: false,
            },
          },
          y2: {
            type: 'linear',
            display: true,
            position: 'right',
            offset: true,
            title: {
              display: true,
              text: 'Hours Worked',
              color: '#f59e0b'
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              padding: 15,
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          },
          title: {
            display: true,
            text: 'Employee Performance Metrics',
            font: {
              size: 16,
              weight: 'bold'
            }
          }
        }
      }
    });

    console.log('✓ Performance chart initialized with', performanceData.length, 'employees');
  } catch (err) {
    console.error('Error initializing performance chart:', err);
  }
}


// Initialize auth on page load (call only if implementation exists)
try {
  if (typeof setupAuthObserver === 'function') {
    setupAuthObserver();
  } else {
    console.log('⚠ setupAuthObserver() not defined, skipping optional auth observer');
  }
} catch (err) {
  console.warn('Error while attempting to run setupAuthObserver():', err);
}
