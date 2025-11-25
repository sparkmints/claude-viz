#!/bin/bash
# Quick test script for claude-viz

set -e

echo "🧪 Testing Claude Code Visualizers locally..."
echo ""

# Build
echo "1️⃣ Building..."
npm run build
echo "✅ Build successful"
echo ""

# Test help
echo "2️⃣ Testing --help..."
node dist/cli.js --help
echo ""

# Test invalid arguments
echo "3️⃣ Testing error handling..."
node dist/cli.js invalid-arg 2>&1 || echo "✅ Error handling works"
echo ""

# Create test plan
echo "4️⃣ Creating test plan..."
mkdir -p ~/.claude/plans
echo "# Test Plan

This is a test plan created by the test script.

## Features
- Real-time updates
- Markdown rendering
- History tracking
" > ~/.claude/plans/test-plan-$(date +%s).md
echo "✅ Test plan created in ~/.claude/plans/"
echo ""

# Check if port is available
echo "5️⃣ Checking if port 8888 is available..."
if lsof -Pi :8888 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 8888 is in use. Will use port 9876 instead."
    TEST_PORT=9876
else
    echo "✅ Port 8888 is available"
    TEST_PORT=8888
fi
echo ""

echo "✅ All pre-checks passed!"
echo ""
echo "📝 To test the visualizer, run:"
echo "   node dist/cli.js --port $TEST_PORT"
echo ""
echo "   Then check:"
echo "   - Plans tab shows your test plan"
echo "   - Todos tab shows your current session"
echo "   - Tab switching works"
echo "   - Real-time updates work (edit a plan file)"
echo ""
