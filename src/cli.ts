#!/usr/bin/env node
import open from 'open';
import { startServer } from './server.js';

const args = process.argv.slice(2);

// Parse arguments
let view: string | undefined;
let port = 8888;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === 'plan' || arg === 'todo') {
    view = arg;
  } else if (arg === '--help' || arg === '-h') {
    console.log('Claude Code Visualizers - Live dashboards for plans and todos\n');
    console.log('Usage: claude-viz [plan|todo] [--port PORT]\n');
    console.log('Commands:');
    console.log('  (no argument)  Opens unified dashboard with both Plans and Todos tabs');
    console.log('  plan           Opens directly to Plans tab');
    console.log('  todo           Opens directly to Todos tab\n');
    console.log('Options:');
    console.log('  --port PORT    Use custom port (default: 8888)');
    console.log('  --help, -h     Show this help message\n');
    console.log('Environment Variables:');
    console.log('  PORT           Alternative way to set port number\n');
    console.log('Examples:');
    console.log('  claude-viz');
    console.log('  claude-viz plan');
    console.log('  claude-viz todo --port 3000');
    console.log('  PORT=9999 claude-viz\n');
    process.exit(0);
  } else if (arg !== '--port') {
    console.error(`Unknown argument: ${arg}\n`);
    console.log('Usage: claude-viz [plan|todo] [--port PORT]');
    console.log('Run "claude-viz --help" for more information');
    process.exit(1);
  }
}

// Allow PORT env var override
if (process.env.PORT && !args.includes('--port')) {
  port = parseInt(process.env.PORT, 10);
}

// Validate port
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`Invalid port number: ${port}`);
  console.error('Port must be between 1 and 65535');
  process.exit(1);
}

// Start unified server
console.log('Starting Claude Viz...\n');
startServer(port);

// Determine which URL to open
let url = `http://localhost:${port}`;
if (view === 'plan') {
  url = `http://localhost:${port}?tab=plans`;
} else if (view === 'todo') {
  url = `http://localhost:${port}?tab=todos`;
}

// Auto-open browser to appropriate view
setTimeout(() => {
  console.log(`Opening browser to ${url}...\n`);
  open(url).catch(err => {
    console.error('Could not auto-open browser:', err.message);
    console.log(`Please open manually: ${url}`);
  });
}, 1500);
