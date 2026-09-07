#!/usr/bin/env bash
# Points the database webhooks at the notify edge function.
#
#   ./supabase/apply-webhooks.sh
#
# Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env, fills them
# into webhooks_notify.sql, and applies it to the linked project. The anon
# key is already public in the deployed frontend bundle, so using it as the
# webhook's bearer token adds no exposure, and it never lands in git.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found in $(pwd). Run this from the project, with your Supabase keys in .env." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL missing from .env}"
: "${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY missing from .env}"

FUNCTION_URL="${VITE_SUPABASE_URL%/}/functions/v1/notify"
TMP="$(mktemp -t tnn-webhooks).sql"
trap 'rm -f "$TMP"' EXIT

sed -e "s#__FUNCTION_URL__#${FUNCTION_URL}#g" \
    -e "s#__ANON_KEY__#${VITE_SUPABASE_ANON_KEY}#g" \
    supabase/webhooks_notify.sql > "$TMP"

echo "Pointing webhooks at ${FUNCTION_URL}"
npx supabase db query --linked -f "$TMP"
