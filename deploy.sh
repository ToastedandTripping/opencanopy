#!/usr/bin/env bash
set -euo pipefail

# OpenCanopy deploy: build locally, upload via CLI, push to git.
# Same pattern as Aspect. Netlify remote builds disabled.

SITE_ID="6b007878-a00d-4ada-86d4-5cf84e9acc2a"

cd "$(dirname "$0")"

echo "==> Building..."
NEXT_PUBLIC_MAPTILER_KEY=4OtdXGRDL08Eqkej5P1R npm run build

echo "==> Deploying to Netlify..."
npx netlify-cli deploy --prod --dir=out --site="$SITE_ID"

echo "==> Pushing to origin (ToastedandTripping)..."
gh auth switch --user ToastedandTripping
git push origin main
gh auth switch --user secretsaunacompany-ui

echo "==> Done. Live at https://opencanopy.ca"
