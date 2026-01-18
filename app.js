/*************************************************
 * WFMS – Frontend Logic (Updated)
 * Backend: Node.js + Express + MySQL
 *************************************************/

/* ========= HELPERS ========= */
const qs = (id) => document.getElementById(id);
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k, d) => JSON.parse(localStorage.getItem(k)) || d;

/* ========= STORAGE KEYS (UI STATE ONLY) ========= */
const CURRENT_KEY = 'wfms_current_user';
const THEME_KEY = 'wfms_theme';

/* ========= API HELPER ========= */
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
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

/* ========= AUTH ========= */

// ❌ OLD LOCAL LOGIN (DISABLED)
/*
window.login = function () {
  const users = load('users', []);
};
*/

// ✅ NEW BACKEND LOGIN
window.login = async function () {
  const usernameInput = qs('username');
  const username = usernameInput.value.trim();
  
  if (!username) {
    showFormError(usernameInput, 'Username is required');
    return;
  }

  // Add loading state
  const loginBtn = document.querySelector('#login-container .btn-primary');
  const originalText = loginBtn.innerHTML;
  loginBtn.classList.add('loading');
  loginBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Loading...';

  try {
    const data = await api('/api/login', 'POST', {
      email: username + '@wfms.local',
      password: username
    });

    if (!data.ok) {
      showFormError(usernameInput, data.error || 'Login failed');
      return;
    }

    showFormSuccess(usernameInput);
    const user = {
      id: data.user.id,
      username: data.user.name,
      role: data.user.role === 'worker' ? 'employee' : 'admin'
    };

    save(CURRENT_KEY, user);
    setTimeout(() => enterDashboard(user), 500);
  } finally {
    loginBtn.classList.remove('loading');
    loginBtn.innerHTML = originalText;
  }
};

// ❌ OLD LOCAL REGISTER (DISABLED)
/*
window.register = function () {};
*/

// ✅ NEW BACKEND REGISTER
window.register = async function () {
  const usernameInput = qs('regUsername');
  const roleSelect = qs('regRole');
  const username = usernameInput.value.trim();
  const roleUI = roleSelect.value;

  if (!username) {
    showFormError(usernameInput, 'Username is required');
    return;
  }

  if (!roleUI) {
    showFormError(roleSelect, 'Please select a role');
    return;
  }

  // Add loading state
  const registerBtn = document.querySelector('#register-container .btn-success');
  const originalText = registerBtn.innerHTML;
  registerBtn.classList.add('loading');
  registerBtn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Creating...';

  try {
    const role = roleUI === 'employee' ? 'worker' : 'admin';

    const data = await api('/api/signup', 'POST', {
      name: username,
      email: username + '@wfms.local',
      password: username,
      role
    });

    if (!data.ok) {
      showFormError(usernameInput, data.error || 'Registration failed');
      return;
    }

    showFormSuccess(usernameInput);
    // Clear form
    usernameInput.value = '';
    roleSelect.value = '';
    
    // Show success message and switch back to login
    setTimeout(() => {
      alert('Account created! Please sign in with your credentials.');
      backToLogin();
    }, 500);
  } finally {
    registerBtn.classList.remove('loading');
    registerBtn.innerHTML = originalText;
  }
};

function logout() {
  localStorage.removeItem(CURRENT_KEY);
  location.reload();
}

/* ========= DASHBOARD ========= */
function enterDashboard(user) {
  qs('auth-overlay').classList.add('hidden');
  qs('dashboard').classList.remove('hidden');
  qs('welcome').innerText = `Welcome, ${user.username}`;

  if (user.role === 'admin') {
    qs('admin-panel').classList.remove('hidden');
    qs('worker-panel').classList.add('hidden');
    loadEmployees();
    loadAdminDashboard();
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

  renderTasks();
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
  const completed = tasks.filter(t => t.status === 'done').length;
  const pending = tasks.filter(t => t.status !== 'done').length;
  
  logUI(`Dashboard: ${completed} completed, ${pending} pending tasks`);
}

async function loadWorkerDashboard(user) {
  // Load worker's assigned tasks
  const tasks = await api('/api/tasks');
  const myTasks = tasks.filter(t => t.assigned_to === user.id);
  const completed = myTasks.filter(t => t.status === 'done').length;
  const pending = myTasks.length - completed;

  qs('workerCompletedTasks').innerText = completed;
  qs('workerPendingTasks').innerText = pending;

  // Load worker's my tasks
  const myTaskList = qs('myTaskList');
  myTaskList.innerHTML = '';

  if (myTasks.length === 0) {
    qs('noTasksMsg').style.display = 'block';
  } else {
    qs('noTasksMsg').style.display = 'none';
    myTasks.forEach(t => {
      const div = document.createElement('div');
      div.className = 'task-item';
      div.innerHTML = `
        <strong>${t.title}</strong>
        <p>${t.description || ''}</p>
        <span class="badge bg-${t.status === 'done' ? 'success' : 'secondary'}">
          ${t.status || 'pending'}
        </span>
      `;
      myTaskList.appendChild(div);
    });
  }

  // Load attendance
  const attendance = await api(`/api/attendance/${user.id}`);
  const attendanceSummary = qs('myAttendance');
  attendanceSummary.innerHTML = '';

  const presentDays = attendance.filter(a => a.status === 'present').length;
  const absentDays = attendance.filter(a => a.status === 'absent').length;
  const attendanceRate = attendance.length > 0 
    ? Math.round((presentDays / attendance.length) * 100) 
    : 0;

  qs('workerAttendanceRate').innerText = attendanceRate + '%';

  attendanceSummary.innerHTML = `
    <div class="attendance-item">
      <span class="attendance-date">Present Days</span>
      <span class="attendance-badge badge-present">${presentDays}</span>
    </div>
    <div class="attendance-item">
      <span class="attendance-date">Absent Days</span>
      <span class="attendance-badge badge-absent">${absentDays}</span>
    </div>
    <div class="attendance-item">
      <span class="attendance-date">Attendance Rate</span>
      <span style="font-weight: 600; color: var(--primary);">${attendanceRate}%</span>
    </div>
  `;

  // Load time logs
  const timeLogs = await api(`/api/time/${user.id}`);
  const timeLogList = qs('myTimeLogs');
  timeLogList.innerHTML = '';

  if (timeLogs.length === 0) {
    timeLogList.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No time logs yet</p>';
  } else {
    timeLogs.slice(0, 10).forEach(log => {
      const time = new Date(log.time).toLocaleTimeString();
      const date = new Date(log.time).toLocaleDateString();
      const actionClass = `action-${log.action.replace(/_/g, '-')}`;
      
      const div = document.createElement('div');
      div.className = 'time-log-item';
      div.innerHTML = `
        <span class="time-log-time">${date} ${time}</span>
        <span class="time-log-action ${actionClass}">${log.action.replace(/_/g, ' ').toUpperCase()}</span>
      `;
      timeLogList.appendChild(div);
    });
  }
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
  inputElement.classList.add('error');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'form-error';
  errorDiv.textContent = message;
  errorDiv.style.color = '#ef4444';
  errorDiv.style.fontSize = '12px';
  errorDiv.style.marginTop = '4px';
  inputElement.parentElement.appendChild(errorDiv);
  
  setTimeout(() => {
    inputElement.classList.remove('error');
    errorDiv.remove();
  }, 3000);
}

function showFormSuccess(inputElement) {
  inputElement.classList.add('success');
  setTimeout(() => {
    inputElement.classList.remove('success');
  }, 2000);
}

/* ========= INIT ========= */
(function init() {
  const user = load(CURRENT_KEY);
  if (user) enterDashboard(user);
})();
