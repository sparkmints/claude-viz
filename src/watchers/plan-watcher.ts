import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { PlanFile, PlanUpdate } from '../types';

export class PlanWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private plansDir: string;

  constructor(plansDir?: string) {
    super();
    // Default to ~/.claude/plans/
    this.plansDir = plansDir || path.join(os.homedir(), '.claude', 'plans');
  }

  async start(): Promise<void> {
    console.log(`Watching plans directory: ${this.plansDir}`);

    // Check if directory exists
    try {
      await fs.access(this.plansDir);
    } catch (error) {
      console.warn(`Plans directory doesn't exist: ${this.plansDir}`);
      console.log('Creating directory...');
      await fs.mkdir(this.plansDir, { recursive: true });
    }

    this.watcher = chokidar.watch(`${this.plansDir}/*.md`, {
      persistent: true,
      ignoreInitial: false,
    });

    this.watcher
      .on('add', (filePath) => this.handleFileChange('created', filePath))
      .on('change', (filePath) => this.handleFileChange('modified', filePath))
      .on('unlink', (filePath) => this.handleFileDelete(filePath))
      .on('error', (error) => console.error(`Watcher error: ${error}`));
  }

  private async handleFileChange(type: 'created' | 'modified', filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      const planFile: PlanFile = {
        filename: path.basename(filePath),
        path: filePath,
        content,
        lastModified: stats.mtimeMs,
      };

      const update: PlanUpdate = {
        type,
        file: planFile,
        timestamp: Date.now(),
      };

      this.emit('update', update);
    } catch (error) {
      console.error(`Error reading plan file ${filePath}:`, error);
    }
  }

  private handleFileDelete(filePath: string): void {
    const update: PlanUpdate = {
      type: 'deleted',
      file: {
        filename: path.basename(filePath),
        path: filePath,
        content: '',
        lastModified: Date.now(),
      },
      timestamp: Date.now(),
    };

    this.emit('update', update);
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  async listPlans(): Promise<PlanFile[]> {
    try {
      const files = await fs.readdir(this.plansDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      const plans: PlanFile[] = [];
      for (const file of mdFiles) {
        const filePath = path.join(this.plansDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);

        plans.push({
          filename: file,
          path: filePath,
          content,
          lastModified: stats.mtimeMs,
        });
      }

      return plans.sort((a, b) => b.lastModified - a.lastModified);
    } catch (error) {
      console.error('Error listing plans:', error);
      return [];
    }
  }
}
