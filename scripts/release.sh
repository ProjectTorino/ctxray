#!/usr/bin/env bash
# Release ctxray: build, test, publish to npm, push to git.
# Requires: `npm login` (npm) and a git remote with push access (GitHub).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> build"
npm run build

echo "==> test"
npm test

echo "==> npm publish"
npm publish

if git remote get-url origin >/dev/null 2>&1; then
  echo "==> git push"
  git push origin HEAD
else
  echo "!! no git remote 'origin' — create one first:"
  echo "   gh repo create ctxray --public --source=. --push   # or"
  echo "   git remote add origin git@github.com:<you>/ctxray.git && git push -u origin main"
fi

echo "done."
