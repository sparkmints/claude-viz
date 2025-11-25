import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import { TodoState, TodoStats } from '../types';

export class TodoWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private todosDir: string;
  private currentState: TodoState | null = null;

  constructor(todosDir?: string) {
    super();
    // Watch the actual Claude Code todos directory
    this.todosDir = todosDir || path.join(os.homedir(), '.claude', 'todos');
  }

  async start(): Promise<void> {
    // Ensure directory exists
    try {
      await fs.access(this.todosDir);
    } catch {
      console.warn(`Todos directory doesn't exist: ${this.todosDir}`);
      return;
    }

    // Load initial state (most recent file)
    await this.loadState();

    // Watch for changes to any JSON file in the directory
    this.watcher = chokidar.watch(path.join(this.todosDir, '*.json'), {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('change', async () => {
      await this.loadState();
      this.emit('update', this.currentState);
    });

    this.watcher.on('add', async () => {
      await this.loadState();
      this.emit('update', this.currentState);
    });

    console.log(`Watching todos directory: ${this.todosDir}`);
  }

  private async loadState(): Promise<void> {
    try {
      // Find the most recently modified JSON file
      const files = await fs.readdir(this.todosDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        this.currentState = {
          sessionId: 'no-session',
          tasks: [],
          lastUpdated: Date.now(),
        };
        return;
      }

      // Get stats for all files and find most recent
      const fileStats = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = path.join(this.todosDir, file);
          const stats = await fs.stat(filePath);
          return { file, path: filePath, mtime: stats.mtimeMs };
        })
      );

      const mostRecent = fileStats.sort((a, b) => b.mtime - a.mtime)[0];

      // Read the most recent file
      const content = await fs.readFile(mostRecent.path, 'utf-8');
      const claudeTodos = JSON.parse(content);

      // Transform Claude Code format to our format
      // Claude format: [{content, status, priority, id}]
      // Our format: {sessionId, tasks: [{content, activeForm, status, timestamp}], lastUpdated}

      const sessionId = mostRecent.file.split('-')[0];

      this.currentState = {
        sessionId,
        tasks: claudeTodos.map((todo: any) => ({
          content: todo.content,
          activeForm: this.generateActiveForm(todo.content),
          status: todo.status === 'pending' ? 'pending' :
                  todo.status === 'in_progress' ? 'in_progress' :
                  'completed',
          timestamp: mostRecent.mtime,
        })),
        lastUpdated: mostRecent.mtime,
      };

      console.log(`Loaded ${this.currentState.tasks.length} todos from ${mostRecent.file}`);
    } catch (error) {
      console.error('Error loading todo state:', error);
    }
  }

  private generateActiveForm(content: string): string {
    // Convert "Do something" to "Doing something"
    // Simple heuristic: add "ing" form
    const words = content.split(' ');
    if (words.length === 0) return content;

    const firstWord = words[0];
    let activeWord = firstWord;

    // Handle common verbs
    if (firstWord.endsWith('e')) {
      activeWord = firstWord.slice(0, -1) + 'ing';
    } else if (firstWord.match(/[^aeiou][aeiou][^aeiou]$/)) {
      // Double last consonant for words like "run" -> "running"
      activeWord = firstWord + firstWord.slice(-1) + 'ing';
    } else {
      activeWord = firstWord + 'ing';
    }

    return activeWord + ' ' + words.slice(1).join(' ');
  }

  getState(): TodoState | null {
    return this.currentState;
  }

  calculateStats(state: TodoState): TodoStats {
    const pending = state.tasks.filter(t => t.status === 'pending').length;
    const inProgress = state.tasks.filter(t => t.status === 'in_progress').length;
    const completed = state.tasks.filter(t => t.status === 'completed').length;
    const total = state.tasks.length;

    return {
      total,
      pending,
      inProgress,
      completed,
      completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  async listSessions(): Promise<Array<{ filename: string; lastUpdated: number; taskCount: number }>> {
    try {
      const files = await fs.readdir(this.todosDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const sessions = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = path.join(this.todosDir, file);
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const todos = JSON.parse(content);

          return {
            filename: file,
            lastUpdated: stats.mtimeMs,
            taskCount: Array.isArray(todos) ? todos.length : 0,
          };
        })
      );

      // Show all sessions with tasks, sorted by most recent
      return sessions
        .filter(s => s.taskCount > 0) // Only show sessions with actual tasks
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
        .slice(0, 50); // Keep last 50 sessions with tasks
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }

  async loadSession(filename: string): Promise<TodoState | null> {
    try {
      const filePath = path.join(this.todosDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      const claudeTodos = JSON.parse(content);
      const stats = await fs.stat(filePath);

      const sessionId = filename.split('-')[0];

      return {
        sessionId,
        tasks: claudeTodos.map((todo: any) => ({
          content: todo.content,
          activeForm: this.generateActiveForm(todo.content),
          status: todo.status === 'pending' ? 'pending' :
                  todo.status === 'in_progress' ? 'in_progress' :
                  'completed',
          timestamp: stats.mtimeMs,
        })),
        lastUpdated: stats.mtimeMs,
      };
    } catch (error) {
      console.error(`Error loading session ${filename}:`, error);
      return null;
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
