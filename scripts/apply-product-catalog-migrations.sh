#!/usr/bin/env bash
# Apply product catalog migrations to a Supabase project you control via CLI.
#
# Lovable Cloud project (qoyxgnkvjukovkrvdaiq / wkzwcfmvnwolgrdpnygc):
#   CLI deploy is blocked — paste the SQL files into Lovable → Database → SQL editor:
#     1. supabase/migrations/20260617120000_product_catalog.sql
#     2. supabase/migrations/20260617130000_product_catalog_phases_5_6.sql
#   Then redeploy edge functions in Lovable Cloud:
#     compose-look-proxy, upload-asset, fetch-reference-image
#
# Standalone Supabase project (e.g. hagfjfzsjqachllkgzcw — must be unpaused):
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="${SUPABASE_PROJECT_REF:-hagfjfzsjqachllkgzcw}"

echo "Linking project ${PROJECT_REF}..."
supabase link --project-ref "${PROJECT_REF}"

echo "Pushing migrations..."
supabase db push

echo "Deploying edge functions..."
supabase functions deploy compose-look-proxy upload-asset fetch-reference-image

echo "Done. Set frontend env in Lovable / Cloudflare:"
echo "  VITE_PRODUCT_CATALOG_ENABLED=true"
echo "  VITE_PRODUCT_LIBRARY_COMPOSE=true   # after wardrobe→product promote + regression"
echo "  VITE_WARDROBE_DEPRECATED=false        # true only after migration complete"
