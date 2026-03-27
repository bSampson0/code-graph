#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./run.sh <github-repo-url>"
  echo "  e.g. ./run.sh https://github.com/owner/repo"
  exit 1
fi

npx tsx src/index.ts "$1"

echo ""
echo "To chat with the graph, run: npm run chat"
