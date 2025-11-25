import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PlanWatcher } from './watchers/plan-watcher.js';
import { TodoWatcher } from './watchers/todo-watcher.js';
import { parsePlan } from './parsers/markdown.js';
import { PlanUpdate, PlanHistory, TodoState } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer(port: number = 8888): void {
  const app = express();

  // Serve static files from public directory
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));

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

  // Serve main HTML page
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
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
