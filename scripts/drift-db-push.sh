#!/usr/bin/env bash
# Sender databaseændringerne (supabase/migrations) til DRIFT-databasen bag app.vixx.dk.
# Bruger sin egen arbejdsmappe (.drift/), så hovedmappens kobling til test-databasen aldrig ændres.
# Kør kun, når Michael har sagt "læg det i drift".
set -euo pipefail
cd "$(dirname "$0")/.."
REF=eypdsujsyxqtklsrcepo
DRIFT=.drift
mkdir -p "$DRIFT/supabase"
rm -rf "$DRIFT/supabase/migrations"
cp -r supabase/migrations "$DRIFT/supabase/migrations"
[ -f "$DRIFT/supabase/config.toml" ] || printf 'project_id = "vixx-drift"\n' > "$DRIFT/supabase/config.toml"
if [ "$(cat "$DRIFT/supabase/.temp/project-ref" 2>/dev/null)" != "$REF" ]; then
  npx supabase --workdir "$DRIFT" link --project-ref "$REF"
fi
echo "Drift-database: $(cat "$DRIFT/supabase/.temp/project-ref")"
npx supabase --workdir "$DRIFT" db push --yes
