// Type definitions for Claude Code Visualizers

// Plan types
export interface PlanFile {
  filename: string;
  path: string;
  content: string;
  lastModified: number;
}

export interface PlanUpdate {
  type: 'created' | 'modified' | 'deleted';
  file: PlanFile;
  timestamp: number;
}

export interface PlanHistory {
  filename: string;
  versions: Array<{
    content: string;
    timestamp: number;
  }>;
}

export interface ParsedPlan {
  html: string;
  sections: PlanSection[];
  steps: string[];
}

export interface PlanSection {
  level: number;
  title: string;
  content: string;
  id: string;
}

// Todo types
export interface TodoTask {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
  timestamp?: number;
}

export interface TodoState {
  sessionId: string;
  tasks: TodoTask[];
  lastUpdated: number;
}

export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionPercentage: number;
}
