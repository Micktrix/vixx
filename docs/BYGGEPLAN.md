# Byggeplan – Vixx

Tre faser. Fase 1 er det, der skal i pilot. Hvert trin afsluttes med en kort status og godkendes, før næste trin starter.

---

## Fase 1 – kernen (pilot)

### Trin 0 – Opsætning
- Next.js + TypeScript + Tailwind. ESLint + typecheck.
- Supabase CLI lokalt, mappen `supabase/migrations/`, seed-script med testdata (én skole, 2 kontorbrugere, 8–9 lærere, ydelser, satser, lokaler, køretøjer).
- GitHub-repo. Vercel-projekt koblet til repo. `test.vixx.dk` peger på Vercel.
- Grundlayout: kontor (sidebar) og lærer (bundmenu), farver og typografi som i prototypen.
- **Færdig når:** appen kører lokalt og på test.vixx.dk med en tom forside.

### Trin 1 – Datamodel og RLS
Tabeller (alle med `school_id`, `created_at`, `updated_at`):
- `schools` – navn, lektionslængde (min), lønperiode-startdag, indstillinger.
- `profiles` – bruger (auth-id), skole, rolle (`admin`/`office`/`instructor`), navn, telefon (E.164, unik), `must_change_password`.
- `instructors` – profil-id, medarbejdernr., gæst (ja/nej, firma, aktiv til), tilgængelighed (`fixed`/`on_request`), kategorier[], typer[], kontakt (e-mail, adresse, postnr., by), ansat fra, fødselsdato, kørelærergodkendelse udløber, pårørende (navn, relation, telefon).
- `rate_groups` (satser) – navn, Dataløn-løndel, aktiv.
- `services` (ydelser) – navn, sats, kategori, type, aktiv.
- `service_prices` – ydelse, gyldig fra, beløb.
- `instructor_prices` – lærer, ydelse, beløb (override).
- `scheduled_lessons` – lærer, ydelse, dato, start, antal, elevnavn, `student_id` (null), note, oprettet af (kontor/lærer).
- `registrations` – lærer, ydelse, dato, start, antal, elevnavn, `student_id` (null), note, status, kommentar, `decided_by`, `decided_at`, `locked_price`, rettet-af-kontor-info.
- `absences` – lærer, dato, start, timer, årsag, note.
- `holidays` – lærer, fra, til, note, status.
- `availability` – lærer, dato, start, slut ("Kan arbejde").
- `resources` – type (`room`/`vehicle`), navn, køretøjstype, aktiv.
- `bookings` – ressource, dato, start, minutter, titel, lærer (null), lektion (null).
- `pay_periods` – start, slut, låst, låst af/hvornår.
- `messages` / `notifications` – til alle eller én lærer, læst.
- `audit_log` – hvem, hvornår, handling, objekt, kort tekst.
- RLS-politikker pr. rolle (se CLAUDE.md). Tests af at en lærer ikke kan se andre læreres data, og at skoler ikke kan se hinanden.
- **Færdig når:** migrationer kører rent, seed virker, RLS-tests er grønne.

### Trin 2 – Login og roller
- Login med telefonnummer + kode. Første login tvinger ny kode.
- Kontoret opretter lærere og kontorbrugere med midlertidig kode, kan nulstille kode og logge ud af alle enheder.
- Rollebaseret adgang til kontor- og lærerdel.
- Login-metoden pakkes, så SMS-engangskode kan tilføjes senere.
- **Færdig når:** man kan logge ind som admin, kontor og lærer og kun se det, rollen må.

### Trin 3 – Undervisere
- Liste, opret (fast/gæst), stamdata, kompetencer, tilgængelighed, egne priser.
- Læreren kan rette egne kontakt- og pårørendeoplysninger.
- **Færdig når:** kontoret kan oprette en lærer, der kan logge ind.

### Trin 4 – Ydelser og satser
- Admin-side: satser (navn, løndel, aktiv) og ydelser (navn, sats, kategori, type, pris med gyldig-fra, aktiv).
- Brugt → kun slå fra. Prishistorik.
- **Færdig når:** prisændring fra en fremtidig dato ikke påvirker lektioner før datoen.

### Trin 5 – Kontorets kalender og planlægning
- Visninger: Dag (lærere i rækker, tidslinje), Uge (lærere × dage), Måned (navne pr. dag). Filter på lærer.
- Planlæg lektion: lærer, dato (fold-ud kalender), start (08:00, optagede tider grå), antal, ydelse (kun dem læreren kan), elev (valgfri), note.
- Ret og fjern planlagt lektion. Fravær (årsag, fra kl., timer).
- "Find ledig underviser".
- Ferie: godkend/afvis.
- **Færdig når:** overlap er umuligt, og alle ændringer logges.

### Trin 6 – Lærer-appen
- Kalender for lønperioden med status pr. dag, dagspanel.
- "Udført" på planlagt lektion → registrering. Tilføj lektion (ydelse, antal, start, elev, note) for i dag/tidligere.
- Planlæg egen lektion frem i tiden (blokerer tid; ret/fjern egne).
- Ferieanmodning, "Jeg kan arbejde" (kun for "Efter aftale"), beskeder, mine oplysninger, overblik (lektioner, timer, godkendt beløb).
- Installérbar som PWA.
- **Færdig når:** en lærer kan klare en hel uge kun fra telefonen.

### Trin 7 – Godkendelser
- Faner: Mangler godkendelse / Godkendt / Afvist. Filter på lærer. Kolonne med lærer.
- Godkend, godkend alle der matcher, ret, afvis med kommentar. Hvem og hvornår vises.
- Prisen låses ved godkendelse.
- **Færdig når:** godkendte beløb ikke ændrer sig ved senere prisændring.

### Trin 8 – Lønoverblik og Dataløn
- Periodevælger, lektioner pr. sats pr. lærer, beløb, afventer.
- Lås/lås op (kun admin). Eksport til CSV (format justeres efter skolens importfil). Gæster udelades.
- **Færdig når:** tallene for en testperiode stemmer med en manuel beregning.

### Trin 9 – Log, beskeder, påmindelser
- Ændringslog med søgning. Beskeder fra kontor til alle/én lærer.
- Påmindelse i appen om manglende registrering og ventende godkendelser.

### Trin 10 – Klar til pilot
- Test-miljø med pilotskolens rigtige lærere, ydelser og priser.
- Backup slået til, fejlovervågning, simpel driftsvejledning.
- Pilot: 2–3 lærere + kontoret, én lønperiode parallelt med Excel.

---

## Fase 2 – efter pilot
- Lokaler og køretøjer (kalendere, booking fra appen, køretøj på lektioner).
- Storskærm (dagens overblik, ledige undervisere).
- Push-beskeder ved ændrede lektioner.
- SMS-engangskode som login.
- "Jeg er syg" fra appen, helligdage i kalenderen.
- Registrering uden net (synkroniseres senere), hvis piloten viser behov.

## Fase 3 – elever
- Elevkonti, tilknytning til lærere, elevbooking af ledige tider.
- Elevens forløb (teori, praktik, prøver) mod lektionsplanens krav.
- Teoriundervisning og prøver i systemet.

---

## Åbne spørgsmål til skolen
- Kronebeløb pr. ydelse, og om de er ens for alle lærere.
- Fordeling af ydelser på satser (især Soldater, Rybners, Diverse) og tillæg for aften/mørke.
- Eksempel på Dataløn-importfil og skolens løndele.
- Navne på kontorbrugere og hvem der er admin.
- Gæstelærere og faktura. Motorcykler (kategori A). Køretøj til Rybners.
