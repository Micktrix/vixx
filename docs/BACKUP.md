# Backup af drift-databasen

Indtil drift-projektet i Supabase opgraderes til Pro (med Supabases egen daglige backup), tages der hver nat
en fuld, krypteret kopi af drift-databasen med GitHub Actions (`.github/workflows/drift-backup.yml`).
Derudover sender Vixx hver nat skolens timer som CSV til skolens backup-e-mail.

## Opsætning (én gang)
1. Supabase → projektet **vixx-drift** → **Connect** → **Session pooler**: kopiér forbindelsen og sæt
   database-passwordet ind. GitHub → repoet → Settings → Secrets and variables → Actions → New repository
   secret: `DRIFT_DB_URL`.
2. Lav en lang kode (fx 5–6 tilfældige ord), gem den i din password-manager, og tilføj den som
   `BACKUP_PASSPHRASE`. **Uden koden kan backuppen ikke åbnes.**
3. GitHub → Actions → "Backup af drift-databasen" → **Run workflow** for at prøve.

## Hent og åbn en backup
1. GitHub → Actions → vælg en kørsel → hent artefaktet `vixx-drift-ÅÅÅÅ-MM-DD`.
2. Pak zip-filen ud og dekryptér:
   `gpg --decrypt backup.tar.gz.gpg > backup.tar.gz && tar xzf backup.tar.gz`
3. Det giver `roles.sql`, `schema.sql` og `data.sql`.

## Gendan (kun efter aftale – overskriver data)
Gendan i et **nyt, tomt** Supabase-projekt og skift derefter app.vixx.dk over til det:
`psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "<forbindelse til det nye projekt>"`
