// Utility: Format relative time
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Tab Management
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
let todoBadgeCount = 0;

function updateTodoBadge(count) {
  const todoButton = document.querySelector('[data-tab="todos"]');
  const existingBadge = todoButton.querySelector('.tab-badge');

  if (count > 0) {
    if (existingBadge) {
      existingBadge.textContent = count;
    } else {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = count;
      todoButton.appendChild(badge);
    }
  } else if (existingBadge) {
    existingBadge.remove();
  }
}

function switchTab(tabName) {
  // Update buttons
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update content
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === tabName + '-tab');
  });

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('tab', tabName);
  history.replaceState({}, '', url);

  // Clear badge when switching to todos
  if (tabName === 'todos') {
    todoBadgeCount = 0;
    updateTodoBadge(0);
    loadTodosTab();
  } else if (tabName === 'plans') {
    loadPlansTab();
  }
}

// Handle tab clicks
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Check URL for initial tab
const urlParams = new URLSearchParams(window.location.search);
const initialTab = urlParams.get('tab') || 'plans';
switchTab(initialTab);

// ===== PLANS TAB =====
let currentPlan = null;

async function loadPlansTab() {
  await loadPlans();
}

async function loadPlans() {
  const res = await fetch('/api/plans');
  const plans = await res.json();

  const planList = document.getElementById('planList');
  planList.innerHTML = plans.map(plan => `
    <li data-filename="${plan.filename}">
      <div class="plan-filename">${plan.filename}</div>
      <div class="plan-timestamp">${formatRelativeTime(plan.lastModified)}</div>
    </li>
  `).join('') || '<li class="loading">No plans found</li>';

  // Add click handlers
  document.querySelectorAll('.plan-list li').forEach(li => {
    li.addEventListener('click', () => loadPlan(li.dataset.filename));
  });

  // Auto-select first plan
  if (plans.length > 0 && !currentPlan) {
    loadPlan(plans[0].filename);
  }
}

async function loadPlan(filename) {
  currentPlan = filename;

  // Update active state
  document.querySelectorAll('.plan-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.filename === filename);
  });

  // Fetch plan
  const res = await fetch(`/api/plans/${filename}`);
  const plan = await res.json();

  // Display
  document.getElementById('planContent').innerHTML = plan.parsed.html;

  // Apply syntax highlighting to code blocks
  document.querySelectorAll('#planContent pre code').forEach((block) => {
    hljs.highlightElement(block);
  });

  // Show outline
  const outlineContainer = document.getElementById('planOutline');
  const outlineList = document.getElementById('outlineList');

  if (plan.parsed.sections && plan.parsed.sections.length > 0) {
    outlineList.innerHTML = plan.parsed.sections
      .filter(s => s.level <= 3) // Only show up to h3
      .map(section => `
        <li class="outline-item level-${section.level}" data-id="${section.id}">
          ${section.title}
        </li>
      `)
      .join('');

    // Add click handlers for outline navigation
    document.querySelectorAll('.outline-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const element = document.getElementById(id);
        if (element) {
          // Scroll with offset to account for top spacing
          const mainContent = document.querySelector('.main-content');
          const elementPosition = element.offsetTop;
          window.scrollTo({
            top: elementPosition - 100,
            behavior: 'smooth'
          });
        }
      });
    });

    outlineContainer.style.display = 'block';
  } else {
    outlineContainer.style.display = 'none';
  }
}

// ===== TODOS TAB =====
let currentSession = 'live';

async function loadTodosTab() {
  // Show live indicator
  const liveIndicator = document.getElementById('liveIndicator');
  if (currentSession === 'live') {
    liveIndicator.style.display = 'inline-block';
  }

  await loadSessions();
  await loadCurrentSession();
}

function renderTask(task) {
  const now = Date.now();
  const timestamp = task.timestamp || now;
  const relativeTime = formatRelativeTime(timestamp);

  // Use activeForm (present tense) only for in-progress tasks
  const displayText = task.status === 'in_progress' ? task.activeForm : task.content;

  // Calculate duration for completed tasks
  let durationHtml = '';
  if (task.status === 'completed' && task.timestamp) {
    durationHtml = `<span class="task-timestamp-item">⏱️ ${relativeTime}</span>`;
  } else if (task.timestamp) {
    durationHtml = `<span class="task-timestamp-item">🕐 ${relativeTime}</span>`;
  }

  return `
    <div class="task-card ${task.status}">
      <div class="task-content">${displayText}</div>
      ${durationHtml ? `<div class="task-timestamp">${durationHtml}</div>` : ''}
    </div>
  `;
}

function renderTasks(state) {
  const pending = state.tasks.filter(t => t.status === 'pending');
  const inProgress = state.tasks.filter(t => t.status === 'in_progress');
  const completed = state.tasks.filter(t => t.status === 'completed');

  document.getElementById('columnPending').innerHTML = pending.length
    ? pending.map(renderTask).join('')
    : '<div class="empty-state"><div class="empty-state-icon">📝</div>No pending tasks</div>';

  document.getElementById('columnInProgress').innerHTML = inProgress.length
    ? inProgress.map(renderTask).join('')
    : '<div class="empty-state"><div class="empty-state-icon">⚡</div>No tasks in progress</div>';

  document.getElementById('columnCompleted').innerHTML = completed.length
    ? completed.map(renderTask).join('')
    : '<div class="empty-state"><div class="empty-state-icon">✨</div>No completed tasks yet</div>';
}

function updateStats(state) {
  const total = state.tasks.length;
  const pending = state.tasks.filter(t => t.status === 'pending').length;
  const inProgress = state.tasks.filter(t => t.status === 'in_progress').length;
  const completed = state.tasks.filter(t => t.status === 'completed').length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statInProgress').textContent = inProgress;
  document.getElementById('statCompleted').textContent = completed;

  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${percentage}% Complete (${completed}/${total})`;
}

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();

    const selector = document.getElementById('sessionSelector');
    // Clear previous sessions (keep live option)
    selector.innerHTML = '<option value="live">🔴 Live (Current Session)</option>';

    // Add archive sessions
    sessions.forEach(session => {
      const date = new Date(session.lastUpdated);
      const dateStr = date.toLocaleString();
      const option = document.createElement('option');
      option.value = session.filename;
      const taskInfo = session.taskCount > 0
        ? `${session.taskCount} tasks`
        : '✅ Completed';
      option.textContent = `📁 ${dateStr} (${taskInfo})`;
      selector.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}

async function loadCurrentSession() {
  try {
    if (currentSession === 'live') {
      const res = await fetch('/api/todos');
      const state = await res.json();
      renderTasks(state);
      updateStats(state);
    } else {
      const res = await fetch(`/api/sessions/${currentSession}`);
      const state = await res.json();
      renderTasks(state);
      updateStats(state);
    }
  } catch (error) {
    console.error('Error loading session:', error);
  }
}

// Handle session change
document.getElementById('sessionSelector').addEventListener('change', (e) => {
  currentSession = e.target.value;

  // Update header to show live vs historical
  const todoHeader = document.getElementById('todoHeader');
  const liveIndicator = document.getElementById('liveIndicator');
  const headerText = document.getElementById('todoHeaderText');

  if (currentSession === 'live') {
    todoHeader.classList.remove('historical');
    liveIndicator.style.display = 'inline-block';
    headerText.textContent = 'TodoWrite Kanban';
  } else {
    todoHeader.classList.add('historical');
    liveIndicator.style.display = 'none';
    headerText.textContent = 'TodoWrite Kanban (Historical)';
  }

  loadCurrentSession();
});

// ===== SERVER-SENT EVENTS =====
const eventSource = new EventSource('/api/stream');
eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === 'plan') {
    const update = message.data;
    console.log('Plan update:', update);

    if (update.type === 'modified' && currentPlan === update.file.filename) {
      // Reload current plan
      loadPlan(currentPlan);
    } else if (update.type === 'created' || update.type === 'deleted') {
      // Reload plan list
      loadPlans();
    }
  } else if (message.type === 'todo') {
    const state = message.data;
    console.log('Todo update:', state);

    if (currentSession === 'live') {
      // Check if we're not on todos tab and there are new tasks
      const activeTab = document.querySelector('.tab-content.active');
      if (activeTab && activeTab.id === 'plans-tab' && state.tasks.length > 0) {
        const inProgressCount = state.tasks.filter(t => t.status === 'in_progress').length;
        if (inProgressCount > 0) {
          todoBadgeCount = inProgressCount;
          updateTodoBadge(inProgressCount);
        }
      }

      renderTasks(state);
      updateStats(state);
    }
  }
};

// Initial load
loadPlansTab();
