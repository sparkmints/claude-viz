import express from 'express';
import { PlanWatcher } from './watchers/plan-watcher';
import { TodoWatcher } from './watchers/todo-watcher';
import { parsePlan } from './parsers/markdown';
import { PlanUpdate, PlanHistory, TodoState } from './types';

export function startServer(port: number = 8888): void {
  const app = express();

  // Store plan history
  const planHistory: Map<string, PlanHistory> = new Map();

  // Initialize watchers
  const planWatcher = new PlanWatcher();
  const todoWatcher = new TodoWatcher();

  // Track connected clients for SSE
  const clients: Set<express.Response> = new Set();

  // Start watchers
  planWatcher.start().then(() => {
    console.log('✓ Plan watcher started');
  });

  todoWatcher.start().then(() => {
    console.log('✓ Todo watcher started');
  });

  // Handle plan updates
  planWatcher.on('update', (update: PlanUpdate) => {
    console.log(`Plan ${update.type}: ${update.file.filename}`);

    // Update history
    if (update.type !== 'deleted') {
      const history = planHistory.get(update.file.filename) || {
        filename: update.file.filename,
        versions: [],
      };

      history.versions.push({
        content: update.file.content,
        timestamp: update.timestamp,
      });

      // Keep only last 10 versions
      if (history.versions.length > 10) {
        history.versions.shift();
      }

      planHistory.set(update.file.filename, history);
    }

    // Broadcast to all connected clients
    broadcastUpdate({ type: 'plan', data: update });
  });

  // Handle todo updates
  todoWatcher.on('update', (state: TodoState) => {
    console.log(`Todos updated: ${state.tasks.length} tasks`);
    broadcastUpdate({ type: 'todo', data: state });
  });

  function broadcastUpdate(message: any): void {
    const data = JSON.stringify(message);
    clients.forEach(client => {
      client.write(`data: ${data}\n\n`);
    });
  }

  // Middleware
  app.use(express.json());

  // Plan API routes
  app.get('/api/plans', async (req, res) => {
    const plans = await planWatcher.listPlans();
    res.json(plans);
  });

  app.get('/api/plans/:filename', async (req, res) => {
    const plans = await planWatcher.listPlans();
    const plan = plans.find(p => p.filename === req.params.filename);

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const parsed = await parsePlan(plan.content);
    res.json({
      ...plan,
      parsed,
    });
  });

  app.get('/api/plans/:filename/history', (req, res) => {
    const history = planHistory.get(req.params.filename);

    if (!history) {
      return res.status(404).json({ error: 'No history found' });
    }

    res.json(history);
  });

  // Todo API routes
  app.get('/api/todos', (req, res) => {
    const state = todoWatcher.getState();
    if (!state) {
      return res.status(404).json({ error: 'No todo state available' });
    }
    res.json(state);
  });

  app.get('/api/todos/stats', (req, res) => {
    const state = todoWatcher.getState();
    if (!state) {
      return res.status(404).json({ error: 'No todo state available' });
    }

    const stats = todoWatcher.calculateStats(state);
    res.json(stats);
  });

  app.get('/api/sessions', async (req, res) => {
    const sessions = await todoWatcher.listSessions();
    res.json(sessions);
  });

  app.get('/api/sessions/:filename', async (req, res) => {
    const state = await todoWatcher.loadSession(req.params.filename);
    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(state);
  });

  // Server-Sent Events for real-time updates
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
  });

  // Serve unified HTML with tabs
  app.get('/', (req, res) => {
    res.send(getUnifiedHTML());
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await planWatcher.stop();
    await todoWatcher.stop();
    process.exit(0);
  });

  // Start server
  app.listen(port, () => {
    console.log(`\n🎯 Claude Code Visualizers running at http://localhost:${port}\n`);
    console.log(`   Plans tab:  http://localhost:${port}?tab=plans`);
    console.log(`   Todos tab:  http://localhost:${port}?tab=todos\n`);
  });
}

function getUnifiedHTML(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Claude Viz</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #1e1e1e;
          color: #d4d4d4;
        }

        /* Tab Navigation */
        .tab-nav {
          background: #252526;
          border-bottom: 1px solid #3e3e42;
          display: flex;
          align-items: center;
          padding: 0 20px;
        }
        .tab-nav h1 {
          font-size: 18px;
          color: #569cd6;
          margin-right: 30px;
          padding: 15px 0;
        }
        .tabs {
          display: flex;
          gap: 5px;
        }
        .tab-button {
          padding: 12px 24px;
          background: transparent;
          border: none;
          color: #858585;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .tab-button:hover {
          color: #d4d4d4;
          background: rgba(255, 255, 255, 0.05);
        }
        .tab-button.active {
          color: #569cd6;
          border-bottom-color: #569cd6;
        }
        .tab-badge {
          display: inline-block;
          background: #d73a49;
          color: white;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 10px;
          margin-left: 6px;
          font-weight: bold;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        /* Tab Content */
        .tab-content {
          display: none;
          padding: 20px;
        }
        .tab-content.active {
          display: block;
        }

        .container { max-width: 1400px; margin: 0 auto; }

        /* Plans Tab Styles */
        .sidebar {
          width: 280px;
          float: left;
          margin-right: 20px;
          background: #252526;
          padding: 15px;
          border-radius: 8px;
        }
        .plan-outline {
          margin-top: 20px;
          padding-top: 15px;
          border-top: 1px solid #3e3e42;
        }
        .plan-outline h3 {
          font-size: 14px;
          color: #858585;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .outline-list {
          list-style: none;
        }
        .outline-item {
          padding: 6px 0;
          color: #858585;
          font-size: 13px;
          cursor: pointer;
          transition: color 0.2s;
        }
        .outline-item:hover {
          color: #569cd6;
        }
        .outline-item.level-1 {
          padding-left: 0;
          font-weight: 500;
          color: #d4d4d4;
        }
        .outline-item.level-2 {
          padding-left: 12px;
        }
        .outline-item.level-3 {
          padding-left: 24px;
          font-size: 12px;
        }
        .sidebar h2 { font-size: 16px; margin-bottom: 10px; }
        .plan-list { list-style: none; }
        .plan-list li {
          padding: 10px;
          margin-bottom: 5px;
          cursor: pointer;
          border-radius: 4px;
          background: #2d2d30;
        }
        .plan-list li:hover { background: #37373d; }
        .plan-list li.active { background: #094771; }
        .plan-filename { display: block; margin-bottom: 4px; }
        .plan-timestamp {
          font-size: 11px;
          color: #858585;
          font-style: italic;
        }
        .main-content {
          margin-left: 300px;
          background: #252526;
          padding: 20px;
          border-radius: 8px;
        }
        .plan-content { line-height: 1.6; }
        .plan-content h1 { color: #569cd6; margin-top: 30px; margin-bottom: 15px; }
        .plan-content h2 { color: #4ec9b0; margin-top: 25px; margin-bottom: 12px; }
        .plan-content h3 { color: #ce9178; margin-top: 20px; margin-bottom: 10px; }
        .plan-content code {
          background: #1e1e1e;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Monaco', 'Courier New', monospace;
        }
        .plan-content pre {
          background: #1e1e1e;
          padding: 0;
          border-radius: 6px;
          overflow-x: auto;
          margin: 15px 0;
        }
        .plan-content pre code {
          background: none;
          padding: 15px;
          display: block;
        }
        .plan-content blockquote {
          border-left: 4px solid #569cd6;
          margin: 15px 0;
          padding-left: 15px;
          color: #d4d4d4;
          font-style: italic;
        }
        .plan-content ul, .plan-content ol { margin-left: 20px; margin-bottom: 15px; }
        .plan-content li { margin-bottom: 8px; }
        .plan-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }
        .plan-content th, .plan-content td {
          border: 1px solid #3e3e42;
          padding: 10px;
          text-align: left;
        }
        .plan-content th { background: #2d2d30; }

        /* Todos Tab Styles */
        .todo-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .todo-header.historical {
          opacity: 0.8;
        }
        .live-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          background: #f97316;
          border-radius: 50%;
          margin-right: 8px;
          animation: blink 1.5s infinite;
          box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7);
        }
        @keyframes blink {
          0% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7);
          }
          50% {
            opacity: 0.7;
            box-shadow: 0 0 8px 4px rgba(249, 115, 22, 0.4);
          }
          100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.7);
          }
        }
        .session-selector {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .session-selector label {
          color: #858585;
          font-size: 14px;
        }
        .session-selector select {
          padding: 8px 12px;
          background: #2d2d30;
          color: #d4d4d4;
          border: 1px solid #3e3e42;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
        }
        .stats {
          display: flex;
          gap: 15px;
          margin-bottom: 30px;
          padding: 20px;
          background: #252526;
          border-radius: 8px;
        }
        .stat-card {
          flex: 1;
          text-align: center;
          padding: 15px;
          background: #2d2d30;
          border-radius: 6px;
        }
        .stat-value {
          font-size: 32px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .stat-label { font-size: 14px; color: #858585; }
        .stat-card.pending .stat-value { color: #858585; }
        .stat-card.in-progress .stat-value { color: #4ec9b0; }
        .stat-card.completed .stat-value { color: #4fc3f7; }
        .stat-card.total .stat-value { color: #ce9178; }
        .progress-bar {
          height: 8px;
          background: #2d2d30;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 30px;
          position: relative;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #0ea5e9 0%, #06b6d4 50%, #10b981 100%);
          transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        .progress-fill::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          animation: shimmer 2s infinite;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .progress-text {
          text-align: center;
          font-size: 12px;
          color: #858585;
          margin-top: 8px;
          font-weight: 500;
        }
        .kanban {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .column {
          background: #252526;
          padding: 15px;
          border-radius: 8px;
          min-height: 400px;
        }
        .column-header {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #3e3e42;
        }
        .column.pending .column-header { color: #858585; }
        .column.in-progress .column-header { color: #4ec9b0; }
        .column.completed .column-header { color: #4fc3f7; }
        .task-card {
          background: #2d2d30;
          padding: 15px;
          margin-bottom: 10px;
          border-radius: 6px;
          border-left: 3px solid;
          transition: transform 0.2s;
        }
        .task-card:hover { transform: translateX(5px); }
        .task-card.pending { border-left-color: #858585; }
        .task-card.in-progress { border-left-color: #4ec9b0; }
        .task-card.completed { border-left-color: #4fc3f7; opacity: 0.7; }
        .task-content { font-size: 14px; margin-bottom: 5px; }
        .task-active { font-size: 12px; color: #858585; font-style: italic; }
        .task-timestamp {
          font-size: 11px;
          color: #858585;
          margin-top: 8px;
          display: flex;
          gap: 10px;
        }
        .task-timestamp-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #858585;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px dashed #3e3e42;
        }
        .empty-state-icon {
          font-size: 32px;
          margin-bottom: 12px;
          opacity: 0.5;
        }
        .loading {
          text-align: center;
          padding: 40px;
          color: #858585;
        }
      </style>
    </head>
    <body>
      <!-- Tab Navigation -->
      <div class="tab-nav">
        <h1>👀 Claude Viz</h1>
        <div class="tabs">
          <button class="tab-button active" data-tab="plans">📋 Plans</button>
          <button class="tab-button" data-tab="todos">✅ Todos</button>
        </div>
      </div>

      <!-- Plans Tab -->
      <div id="plans-tab" class="tab-content active">
        <div class="container">
          <div class="sidebar">
            <h2>Available Plans</h2>
            <ul class="plan-list" id="planList">
              <li class="loading">Loading plans...</li>
            </ul>
            <div class="plan-outline" id="planOutline" style="display: none;">
              <h3>Outline</h3>
              <ul class="outline-list" id="outlineList"></ul>
            </div>
          </div>
          <div class="main-content">
            <div id="planContent" class="plan-content">
              <p class="loading">Select a plan to view</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Todos Tab -->
      <div id="todos-tab" class="tab-content">
        <div class="container">
          <div class="todo-header" id="todoHeader">
            <h2 style="color: #569cd6; font-size: 20px; margin: 0;">
              <span class="live-indicator" id="liveIndicator" style="display: none;"></span>
              <span id="todoHeaderText">TodoWrite Kanban</span>
            </h2>
            <div class="session-selector">
              <label>Session:</label>
              <select id="sessionSelector">
                <option value="live">🔴 Live (Current Session)</option>
              </select>
            </div>
          </div>
          <div class="stats">
            <div class="stat-card total">
              <div class="stat-value" id="statTotal">0</div>
              <div class="stat-label">Total Tasks</div>
            </div>
            <div class="stat-card pending">
              <div class="stat-value" id="statPending">0</div>
              <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card in-progress">
              <div class="stat-value" id="statInProgress">0</div>
              <div class="stat-label">In Progress</div>
            </div>
            <div class="stat-card completed">
              <div class="stat-value" id="statCompleted">0</div>
              <div class="stat-label">Completed</div>
            </div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
          </div>
          <div class="progress-text" id="progressText">0% Complete</div>
          <div class="kanban">
            <div class="column pending">
              <div class="column-header">📝 Pending</div>
              <div id="columnPending" class="task-list">
                <div class="loading">Loading...</div>
              </div>
            </div>
            <div class="column in-progress">
              <div class="column-header">⚡ In Progress</div>
              <div id="columnInProgress" class="task-list">
                <div class="loading">Loading...</div>
              </div>
            </div>
            <div class="column completed">
              <div class="column-header">✅ Completed</div>
              <div id="columnCompleted" class="task-list">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Utility: Format relative time
        function formatRelativeTime(timestamp) {
          const now = Date.now();
          const diff = now - timestamp;
          const seconds = Math.floor(diff / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          if (seconds < 60) return 'just now';
          if (minutes < 60) return \`\${minutes}m ago\`;
          if (hours < 24) return \`\${hours}h ago\`;
          if (days < 7) return \`\${days}d ago\`;
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
          planList.innerHTML = plans.map(plan => \`
            <li data-filename="\${plan.filename}">
              <div class="plan-filename">\${plan.filename}</div>
              <div class="plan-timestamp">\${formatRelativeTime(plan.lastModified)}</div>
            </li>
          \`).join('') || '<li class="loading">No plans found</li>';

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
          const res = await fetch(\`/api/plans/\${filename}\`);
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
              .map(section => \`
                <li class="outline-item level-\${section.level}" data-id="\${section.id}">
                  \${section.title}
                </li>
              \`)
              .join('');

            // Add click handlers for outline navigation
            document.querySelectorAll('.outline-item').forEach(item => {
              item.addEventListener('click', () => {
                const id = item.dataset.id;
                const element = document.getElementById(id);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            durationHtml = \`<span class="task-timestamp-item">⏱️ \${relativeTime}</span>\`;
          } else if (task.timestamp) {
            durationHtml = \`<span class="task-timestamp-item">🕐 \${relativeTime}</span>\`;
          }

          return \`
            <div class="task-card \${task.status}">
              <div class="task-content">\${displayText}</div>
              \${durationHtml ? \`<div class="task-timestamp">\${durationHtml}</div>\` : ''}
            </div>
          \`;
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
          progressFill.style.width = \`\${percentage}%\`;
          progressText.textContent = \`\${percentage}% Complete (\${completed}/\${total})\`;
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
                ? \`\${session.taskCount} tasks\`
                : '✅ Completed';
              option.textContent = \`📁 \${dateStr} (\${taskInfo})\`;
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
              const res = await fetch(\`/api/sessions/\${currentSession}\`);
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
      </script>
    </body>
    </html>
  `;
}
