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
- `instructors` – profil-id, medarbejdernr., gæst (ja/nej, firma, aktiv til), tilgængelighed (`fixed`/`on_request`), kontakt (e-mail, adresse, postnr., by), ansat fra, fødselsdato, kørelærergodkendelse udløber, pårørende (navn, relation, telefon).
- `services` (ydelser) – navn, Dataløn-løndel, aktiv. Satsen (kr. pr. lektion med gyldig-fra) i `service_prices`.
  (Ændret 11. nov. 2026: sats-grupper, kategorier og typer er fjernet overalt; satsen sidder på ydelsen.)
- `service_prices` – ydelse, gyldig fra, beløb.
- `instructor_prices` – lærer, ydelse, beløb (override).
- `scheduled_lessons` – lærer, ydelse, dato, start, antal, elevnavn, `student_id` (null), note, oprettet af (kontor/lærer).
- `registrations` – lærer, ydelse, dato, start, antal, elevnavn, `student_id` (null), note, status, kommentar, `decided_by`, `decided_at`, `locked_price`, rettet-af-kontor-info.
- `absences` – lærer, dato, start, timer, årsag, note.
- `holidays` – lærer, fra, til, note, status.
- `availability` – lærer, dato, start, slut ("Kan arbejde").
- `resources` – type (`room`/`vehicle`), navn, aktiv.
- `bookings` – ressource, dato, start, minutter, titel, lærer (null), lektion (null).
- `pay_periods` – start, slut, låst, låst af/hvornår.
- `messages` / `notifications` – til alle eller én lærer, læst.
- `audit_log` – hvem, hvornår, handling, objekt, kort tekst.
- RLS-politikker pr. rolle (se CLAUDE.md). Tests af at en lærer ikke kan se andre læreres data, og at skoler ikke kan se hinanden.
- **Færdig når:** migrationer kører rent, seed virker, RLS-tests er grønne.

### Trin 2 – Login og roller
- Login med telefonnummer + kode. Første login tvinger ny kode.
- Kontoret opretter lærere og kontorbrugere med telefonnummeret som første kode (ændret 11. nov. 2026), kan nulstille kode og logge ud af alle enheder.
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

### Trin 11 – Lokaler, køretøjer og storskærm
(Flyttet fra Fase 2 efter ønske, så det kan være med i piloten.)
- Kalendere for lokaler og køretøjer (dag/uge), booking i ledige tider. Ingen dobbeltbooking.
- Ved planlægning kan et køretøj eller lokale kobles på lektionen; bookingen følger lektionen.
- "Book" i lærer-appen: ledige lokaler/køretøjer, egne bookinger kan rettes/slettes.
- Storskærm: dagens overblik (lektioner, undervisere, fravær/ferie, afventer, bookinger). Aldrig elevnavne.
- Lokaler og køretøjer vedligeholdes under Indstillinger.
- **Færdig når:** et køretøj kan ikke dobbeltbookes, og det følger lektionen, når den flyttes.

### Trin 10 – Klar til pilot
- Test-miljø med pilotskolens rigtige lærere, ydelser og priser.
- Backup slået til, fejlovervågning, simpel driftsvejledning.
- Pilot: 2–3 lærere + kontoret, én lønperiode parallelt med Excel.

---

## Fase 2 – efter pilot
- Push-beskeder ved ændrede lektioner.
- SMS-engangskode som login.
- "Jeg er syg" fra appen, helligdage i kalenderen.
- Registrering uden net (synkroniseres senere), hvis piloten viser behov.

## Fase 3 – elever (startet 12. nov. 2026)
Idé: eleven har sin egen profil og ser sit forløb. Eleven viser en QR-kode, læreren scanner den i lærer-appen og
kvitterer for lektionen (kørelærerens underskrift), og eleven bekræfter i sin app (elevens underskrift). Det
erstatter papirets lektionsplan med dato og to underskrifter.

### Trin E1 – Forløb (Indstillinger → Forløb)
- Admin bygger selv forløb pr. kategori (B, C, D, CE …) og kan rette dem, når ministeriet ændrer noget.
- Lektion: nummer, længde (antal × 45 min.), type (kørsel/teori), sted (fx øvelsesstrækning), indhold (punkter
  som "7.1 Igangsætning og standsning v. kantsten"), noter og kontrolstof. Rækkefølge kan ændres.
- En lektion, der er kvitteret for, kan kun slås fra, ikke slettes. Kvitteringer gemmer lektionens nummer og titel.
- Kun admin retter; alle på skolen kan se.
- **Færdig når:** C-forløbet fra papiret kan ses og rettes, og kontoret ikke kan rette.

### Trin E2 – Elever og hold (Kontor → Elever)
- Hold med elever. Elev oprettes med telefonnummer (login som lærerne), forløb og ydelse (til lønnen).
- Kontoret ser hold og elever med fremskridt i forløbet på en overskuelig måde.
- Elevens app: forløbet med gennemførte og manglende lektioner.

### Trin E3 – QR-kvittering
- Eleven viser en QR-kode; læreren scanner, ser hvad eleven mangler, vælger lektionen og kvitterer.
- Kørselslektioner: samme tryk registrerer timen til lønnen (ydelse fra elevens forløb, tid fra planlagt lektion
  eller lektionsplanen; kan rettes eller fravælges). Teorilektioner går ikke til lønnen.
- Eleven bekræfter i sin app. En kvittering kan aldrig slettes; den står som "afventer elev", til eleven bekræfter.

### Trin E5 – Eleven anmoder om kørelektioner (aftalt 12. nov. 2026)
- Kontoret kobler eleven på én eller flere faste lærere og sætter fluebenet "Må selv anmode om kørelektioner"
  (pr. elev, uanset hold og forløb – typisk B-elever, men også fx en aftenelev, der vil køre i dagtimerne).
- Læreren åbner tider i lærer-appen (dato, starttid fra lektionsplanen, antal lektioner). En åben tid gør ikke
  læreren optaget; man kan ikke åbne en tid, hvor man er optaget.
- Eleven ser kun åbne tider hos sine egne lærere og anmoder. Én anmodning pr. åben tid.
- Læreren godkender eller afviser. Godkendt = planlagt lektion med elevens navn og ydelse (læreren er optaget).
  Afvist = tiden er åben igen.
- Eleven kan melde afbud på en booket lektion indtil en frist før (indstilling pr. skole, standard 24 timer).
  Tiden bliver åben igen. Efter fristen kun via kontoret.
- Elevens app får bundmenu: Kalender (bookede lektioner, anmodninger og åbne tider), Forløb, QR og Mere
  (oplysninger, kode, kalender-abonnement, kontakt til skolen og de faste lærere, log ud).
- Kalender-abonnement (iCal) pr. elev med hemmeligt link, som lærernes.
- Kontoret ser åbne tider og anmodninger.

### Trin E6 – Beskeder til elever
- Kontoret sender beskeder til alle elever, et hold eller én elev. Eleven ser dem i appen.

### Trin E7 – Prøver og tjekliste
- Dato for teori- og køreprøve pr. elev. Tjekliste før prøven (fx lægeerklæring, førstehjælp).

### Trin E4 – Push-beskeder
- Påmindelse dagen før en lektion og om lektioner, der ikke er bekræftet. Besked ved godkendt/afvist anmodning.
  Senere også beskeder til lærerne.

### Trin E8 – Modulplaner (Færdselsstyrelsen, krav fra 1. juli 2026)
- Modulplanen erstatter lektionsplanen. Forløb bygges som moduler: nummer, navn, minimum teori, minimum kørsel
  (evt. i mørke) og emner (afsnit). Forløbet har minimum i alt og minimum undervisningsdage (B: 30 + 24, 14 dage;
  D: 16 + 18, 12 dage; C/E: 13 + 18, 10 dage). Skabeloner ud fra Færdselsstyrelsens planer (B, C, C/E, D, D/E, A …).
- Læreren scanner og vælger teori eller kørsel; det tælles i elevens aktuelle modul (kørsel går stadig til lønnen).
- Læreren afslutter modulet i appen (dato og lærer gemmes; Vixx viser, om minimum er nået).
- Også: repetitionslektioner efter ikke bestået praktisk prøve, lærerskift midt i et modul, selvstudie,
  manuelt gear (kode 78, kun B), skolens oplysninger (navn, CVR, adresse, telefon).
- Print: Vixx udfylder Færdselsstyrelsens udfyldbare PDF ("digital"-versionen); den afsluttende kørelærer skriver
  under med kuglepen pr. modul. Ingen elevunderskrift i modulplanen.
- Underskrift (aftalt 18. nov. 2026): læreren tegner sin underskrift med fingeren én gang under "Oplysninger"
  (kan tegnes om). Når læreren scanner eleven, og modulets minimum er nået, viser Vixx "Modul X er klar til at
  blive afsluttet". Læreren sætter flueben ved erklæringen ("eleven har opnået de nødvendige kompetencer") og
  trykker "Afslut modul". Underskriften, dato, lærerens navn og detaljerne lægges så automatisk på modulplanen.
  Modulet afsluttes aldrig af sig selv uden lærerens flueben. Afslutningen gemmes med hvem og hvornår og kan
  ikke ændres eller slettes. Underskriften sættes ind i feltet "Afsluttende kørelærers underskrift" i den
  udfyldte PDF.
- Michael regner med, at det er tilladt. Anbefaling: få det bekræftet skriftligt af Færdselsstyrelsen ("må
  kørelæreren gemme sin elektroniske underskrift én gang, så den sættes på, når læreren afslutter et modul?")
  (erklæring til myndighed, straffelovens § 163).
- Den digitale PDF har også underskriftsfelter af typen digital signatur (/Sig). MitID-signering er en
  mulighed senere.
- Færdselsstyrelsens guide "Sådan udfylder du modulplanen digitalt" (læst 19. nov. 2026):
  - Køreskoler må integrere modulplanen i egne it-systemer, så længe den kan vises med styrelsens layout og
    logo. Der stilles ingen krav til særlige it-systemer.
  - Den digitale underskrift, guiden beskriver, er et digitalt ID (certifikat) i Adobe Acrobat Reader, ikke en
    tegnet underskrift. Guiden nævner ikke tegnede underskrifter i egne systemer, så det skal stadig bekræftes.
  - Hver ny underskrift gemmes som en ny version, og alle versioner arkiveres. Vixx gemmer derfor hver
    underskrevet udgave og kan aldrig overskrive eller slette en.
  - Datofelterne i PDF'en skal have formatet d/m/yy.
  - Delvis digital udfyldning er tilladt: fx stamdata digitalt og resten i hånden. Når man er gået over til
    papir, kan planen ikke længere udfyldes digitalt.
  - Ved lærerskift sendes den gemte version videre til kollegaen, så det er altid den seneste version, der gælder.
  - Eleven kan vise planen til køreprøven på telefonen eller som print. Eleven skal have den seneste version,
    så elevens app skal vise den.
  - Spørgsmål sendes til koereuddannelse@fstyr.dk med emnet "Digital modulplan".
- Michaels beslutning (19. nov. 2026): læreren må lave en digital underskrift i Vixx.
  - **Bygget 19. nov. 2026:** siden "Min underskrift" i lærer-appen (Beskeder → Min underskrift). Læreren
    tegner med fingeren og trykker "Gem og lås". "Lås op og tegn igen" bruges, hvis den skal laves om; den gamle
    gælder, til en ny er gemt.
  - Tabellen `instructor_signatures` gemmer kun stregdata. Kun læreren selv kan se og rette den, heller ikke
    admin og kontor. Ændringsloggen skriver ikke stregerne.
  - Når modulplanen er bygget, sætter Vixx underskriften på automatisk, hver gang læreren afslutter et modul.
    Vixx gemmer en kopi af underskriften på afslutningen, så en ny underskrift senere ikke ændrer gamle moduler.
  - Modulplanen (Færdselsstyrelsens PDF) lægges op pr. kørekortkategori (B, C, C/E, D …) under Indstillinger →
    Forløb. Vixx udfylder den for hver elev, og eleven og læreren kan altid vise den seneste udgave.
  - Gennemgang af Færdselsstyrelsens udfyldbare modulplaner, version 1.1 april 2026 (B, C, C/E og D; 19. nov.
    2026):
    | Kategori | Sider | Moduler (min. teori + kørsel) | I alt | Dage |
    |---|---|---|---|---|
    | B | 20 | 1: 7+0 · 2: 5+3 · 3: 8+6 · 4: 9+6 (1 i mørke) · 5: 1+9 | 30 + 24 | 14 |
    | C | 16 | 1: 8+5 · 2: 7+5 (1 i mørke) · 3: 1+8 | 16 + 18 | 12 |
    | C/E | 16 | 1: 7+5 · 2: 5+5 · 3: 1+8 | 13 + 18 | 10 |
    | D | 16 | 1: 8+5 · 2: 7+5 (1 i mørke) · 3: 1+8 | 16 + 18 | 12 |
    - Underskriften bruges fire steder, ikke kun ved afslutning af et modul:
      1. "Undervisende kørelærere" (12 linjer): hver lærer, der underviser eleven, skriver navn og underskrift
         én gang. Vixx tilføjer læreren første gang, læreren har eleven.
      2. Afslutning af hvert modul: dato, den afsluttende lærers navn og underskrift, plus antal ekstra
         teori- og kørelektioner, selvstudie og "Overført fra lektionsplan".
      3. Repetitionslektioner efter ikke bestået praktisk prøve (op til 27 linjer): dato, antal og underskrift.
      4. Kørelærerskift i et ikke afsluttet modul (8 linjer): modul, antal teori og kørsel, gennemførte afsnit,
         underskrift og dato.
    - Kun B har feltet om manuelt gear (forsøgsordningen kode 78/148) i modul 2–5.
    - Siden "Oplysninger om køreskole" har plads til den første skole og to skift af køreskole.
    - Felternes navne er forskellige fra plan til plan, går igen på flere sider og har stavefejl (fx "CVRnpr",
      "udnerskrift"). Vixx skal derfor have en kortlægning af felterne pr. kategori og version. Når
      Færdselsstyrelsen laver en ny version, skal kortlægningen opdateres, før den nye PDF kan bruges.
    - Skolen skifter selv modulplanen (aftalt 19. nov. 2026):
      - Admin lægger en ny version op under Indstillinger → Forløb.
      - Vixx læser felterne og genkender dem, hvis de hedder det samme som før.
      - Mangler der felter, viser Vixx en enkel side, hvor admin vælger, hvilket felt i PDF'en hver oplysning
        skal i, fx "Dato for afslutning af modul 2". Når alle felter er sat, kan versionen tages i brug.
      - Admin kan se et prøvetryk med testdata, før versionen tages i brug.
      - Gamle versioner gemmes, så elevernes udfyldte planer altid kan vises igen.
      - Nye elever får den nye version. Elever, der er i gang, beholder deres version, medmindre admin flytter
        dem.
    - Underskriftsfelterne er af typen digital signatur. Vixx lægger den tegnede underskrift ind som et billede
      på feltets plads; det er ikke en certifikat-underskrift.
  - EU-moduler (aftalt 19. nov. 2026): en kategori kan have en ekstra modulplan til EU (fx C/E med EU). Når en
    elev oprettes eller sættes på et hold, vælger kontoret, om eleven også skal gennemføre EU-modulerne. I så fald
    får eleven begge planer. EU-modulerne afsluttes og underskrives på samme måde (lærerens gemte underskrift,
    dato, navn), og hver plan har sin egen PDF og sine egne versioner. Det endelige indhold venter på skolens
    EU/AMU-blanketter.
- Opdeling i små dele (19. nov. 2026):
  1. Modulforløb B: forløb som moduler fra skabelon, admin retter, alle på skolen ser, eleven ser sit eget.
     **Bygget 19. nov. 2026:** `courses.plan_kind` ('lessons'/'modules'), `plan_version`, `min_days` og tabellen
     `course_modules` (nummer, navn, min. teori, min. kørsel, heraf i mørke, emner, note). Funktionen
     `create_module_course(skole, 'B-1.1', navn)` lægger B-planens 5 moduler ind (emner fra PDF'en version 1.1).
     Et forløb er enten lektioner eller moduler og kan ikke skifte. Indstillinger → Forløb → "Nyt forløb fra
     modulplanen".
  2. Skabeloner for C, C/E og D (og senere EU-moduler).
     **Bygget 19. nov. 2026:** `create_module_course` kender nu 'C-1.1', 'CE-1.1' og 'D-1.1' (3 moduler hver,
     emner fra PDF'erne). C/E har påhængskøretøjet i afsnit 1 og ingen kørsel i mørke (7.19). EU-moduler venter
     på skolens blanketter.
  3. Eleven på modul: aktuelt modul og opstartsdato; scanning tæller teori/kørsel i modulet; elevens app viser
     modulerne.
     **Bygget 19. nov. 2026** (Michael: læreren vælger modulet, og det går ikke til lønnen): tabellen
     `module_signoffs` (modul, teori/kørsel, antal, i mørke, lærer, dato). Læreren scanner, Vixx foreslår første
     modul, hvor minimum ikke er nået, og læreren kan vælge et andet. Opstartsdato = første tælling i modulet.
     Kan ikke slettes; admin kan rette antal, modul og mørke og give lektioner uden lærer med kommentar (kun i
     databasen endnu, ingen skærm). Elevens app, kontorets elevside og elevlisten viser modulerne. Seed: Bent
     Elev (B).
  4. Afslut modul: minimum-tjek, ekstra lektioner, selvstudie, "Overført fra lektionsplan", undervisende kørelærere.
     **Bygget 19. nov. 2026** (Michael: minimum skal være nået, medmindre "Overført fra lektionsplan"; modulerne
     afsluttes i rækkefølge; Vixx regner de ekstra lektioner ud): tabellen `module_completions`. Ved scanning
     viser Vixx "Modul X er klar til at blive afsluttet"; læreren sætter flueben ved erklæringen, evt. selvstudie
     og "Overført", og trykker "Afslut modul". Dato, lærer, ekstra teori og kørsel gemmes og kan aldrig ændres
     eller slettes. Der kan ikke tælles i et afsluttet modul. Aktuelt modul = første, der ikke er afsluttet.
     Undervisende kørelærere vises på kontorets elevside (udledt af tællinger og afslutninger). Underskriften
     kommer med PDF'en.
  4b. **Bygget 19. nov. 2026** (aftalt med Michael): admin kan annullere en fejlagtig afslutning med
     begrundelse på kontorets elevside. Den slettes ikke, men markeres annulleret (hvem, hvornår, hvorfor), og
     modulet er åbent igen. Kun det seneste afsluttede modul kan annulleres. Admin kan også afslutte et modul
     for en gæstelærer uden app (navn, dato, kommentar). Admin afgiver ikke erklæringen; gæstelæreren skriver
     under med kuglepen på den udskrevne modulplan, og Vixx sætter aldrig en tegnet underskrift på.
  5. Lærerskift, repetitionslektioner, manuelt gear (kode 78) og skolens oplysninger.
     **Skolens oplysninger bygget 19. nov. 2026:** CVR-nr., adresse og telefon under Indstillinger → Skolen
     (og når platform-ejeren opretter en skole). Admin kan lægge skolens logo op (PNG/JPEG/WebP, højst 1 MB,
     offentlig bucket `school-logos`, kun serveren lægger op). Logoet vises i kontorets menu og øverst i lærer-
     og elevappen. Om logoet må stå på Færdselsstyrelsens modulplan, er ikke afklaret.
     **Resten bygget 19. nov. 2026** (aftalt med Michael):
     - Kode 78 (manuelt gear, kun B): kontoret sætter flueben på eleven. Læreren markerer "Manuelt gear (kode
       78)" ved kørsel i modul 2–5, og Vixx skriver antallet pr. modul på modulplanen.
     - Repetitionslektioner efter ikke bestået praktisk prøve: når alle moduler er afsluttet, registrerer
       læreren dem ved scanning (antal). Dato, navn og en kopi af underskriften (kræves) kommer på planen.
       Kan ikke ændres eller slettes (tabellen `repetition_lessons`).
     - Lærerskift: eleverne skifter ofte lærer inden for skolen, og det dækkes af "Undervisende kørelærere".
       Siden "Oplysninger ved kørelærerskifte" og felterne for skift af køreskole udfyldes i hånden, hvis
       eleven skifter køreskole.
  6. PDF: upload af styrelsens PDF, feltkortlægning, udfyldning og gemte versioner.
     **6a bygget 19. nov. 2026** (Michael: læreren skal have gemt sin underskrift for at afslutte; kontoret
     taster elevens adresse): Vixx udfylder styrelsens PDF (B, C, C/E og D, version 1.1, ligger i
     `src/lib/modulplan/templates`) med elev, skole, undervisende kørelærere, modulernes start- og slutdato,
     ekstra lektioner, selvstudie, "Overført", den afsluttende lærers navn og de tegnede underskrifter.
     Felterne findes ud fra siden (navnene har stavefejl). Formularen låses (flades ud). Lærere, kontor og admin
     printer via "Print modulplan" (kontorets elevside) og "Se og print modulplanen" (lærerens scanning);
     eleven kan ikke hente PDF'en. Kopier af underskrifterne (`module_completions.strokes`,
     `module_plan_teachers`) kan ikke læses via API'et; serveren læser dem. Hver ny udgave gemmes i
     bucketten `module-plans` og `module_plan_versions` og slettes aldrig. Repetition og manuelt gear
     udfyldes med del 5.
     **6c-1 bygget 19. nov. 2026** (Michael: version pr. elev; 6c delt i to): tabellen `module_plan_templates`
     (bucket `module-plan-templates`). Hvert modulforløb har en eller flere PDF-versioner; 1.1 for B, C, C/E og D
     er indbygget. Under Forløb → "Modulplanens PDF" lægger admin en ny version op. Vixx genkender felterne og
     gemmer et feltkort, admin retter manglende felter (siden "Feltkort"), ser et prøvetryk med testdata og
     tager versionen i brug. En version i brug kan ikke ændres eller slettes. Nye elever får nyeste version;
     elever i gang beholder deres (`students.plan_template_id`), og kun admin kan flytte dem (elevsiden).
     Admin kan oprette en "Modulplan uden skabelon (fx EU-moduler)" og selv tilføje og slette ubrugte moduler.
     **6c-2 (mangler):** elever med to planer (fx C/E og EU). Læreren ser modulerne fra begge planer i én liste
     ved scanning; hver plan har sin egen PDF. Venter på skolens EU/AMU-blanketter.
     Michael (19. nov. 2026): EU tilføjes på selve forløbet (fx "Tilføj EU-moduler" på C/E-forløbet), ikke som et
     løst forløb. EU vælges pr. elev (flueben på eleven): ikke alle elever på et C- eller C/E-hold skal have EU.
     Kun elever med fluebenet får EU-modulerne ved scanning og en EU-modulplan at printe.
     "Nyt forløb" er forenklet: man vælger kategorien (og evt. navn), og Vixx henter selv Færdselsstyrelsens
     modulplan for B, C, C/E og D. Andre kategorier bliver et tomt modulforløb. "Egen modulplan" ligger under
     "Andre muligheder".
     **Den gamle lektionsplan er fjernet (20. nov. 2026, aftalt med Michael; intet i drift):** tabellerne
     `course_lessons`, `lesson_signoffs` og `theory_signoffs`, lektionsplanens editor og skabeloner, QR-kvittering
     pr. lektion med elevens bekræftelse, admins "Kryds af"/"Ret lektion" og den gamle teoritæller. Alle forløb er
     modulplaner; et tidligere lektionsforløb bliver et tomt modulforløb. Trin E1 og E3 nedenfor er derfor
     historik. Elevens underskrift i appen bygges igen med taxa og EU, hvor planen kræver den.
     **Skolens kørelektioner under modulerne (bygget 20. nov. 2026, aftalt med Michael):** tabellen `module_lessons`
     (nummer, antal × 45 min., mørke, sted, punkter, note, kontrolstof). Skolens "Lektionsskema C + D" kan indsættes
     på C- og D-forløb (`add_lesson_schedule`): lektion 2, 4, 6 i modul 1; 9, 11, 12 (mørke) i modul 2; 13, 17, 18
     i modul 3. Modulfordelingen er Vixx' forslag og kan rettes. Ved scanning vælger læreren lektionen (flere kan
     vælges, fx 17 + 18) og krydser de punkter af, der IKKE blev kørt. Lektionen tæller selv som kørsel i modulet,
     og en lektion køres én gang pr. elev. Modulet er "klar til afslutning", når minimum er nået og alle dets
     lektioner er kørt. Punkter, der ikke er kørt, og lektioner, der mangler, giver en advarsel, men stopper ikke
     afslutningen (fx "7.20 Kørsel i tunnel"). Eleven må køre i næste modul, før det forrige er afsluttet.
     **Afkrydsning af modulets egne punkter (20. nov. 2026, aftalt med Michael):** ved kørsel uden skolens lektion
     ser læreren modulets punkter (afsnittene) med flueben ved det hele og fjerner fluebenet ved det, der ikke blev kørt (også ved skolens lektioner). Scanningen starter på
     "Kørsel". Et punkt er kørt, så snart det har haft flueben i én kørsel. Næste lærer ser punkterne, eleven
     mangler, markeret "mangler" og fortsætter derfra. Er alle punkter kørt, men minimum ikke nået, viser
     scanningen, at de næste lektioner er repetition. Punkter, der allerede er kørt, står grønne med "kørt". Er modulet
     klar til afslutning (minimum nået og alle lektioner kørt), viser scanningen en advarsel: lektioner, der tælles
     nu, kommer på planen som ekstra lektioner (ingen blokade; ekstra lektioner er tilladt). Afsluttede moduler kan
     ikke vælges ved scanning. "Afslut modul" kommer selv frem som "Vil du afslutte modul X? Alle lektioner er
     kørt, og minimum er nået", når modulet er klar. Før det er der kun et lille link "Er eleven overført fra
     lektionsplanen?" til elever, der afsluttes uden at minimum er talt i Vixx.
     **Nye C- og D-forløb får kørelektionerne automatisk (20. nov. 2026):** Vixx kopierer dem fra skolens eget nyeste
     forløb i samme kategori (`copy_module_lessons`, med skolens rettelser); findes der ikke et, indsættes
     lektionsskemaet C + D som udgangspunkt. Ønske fra Michael: et sted at lægge et nyt lektionsskema op, når det
     ændres, og få det lavet om til lektioner. Det bygges sammen med "forløb ud fra en PDF" (taxa, AI).
     Oprindeligt ønske:
     Michael (19. nov. 2026): der skal være plads til flere modulplaner under samme kategori, fx C/E og
     "C/E med EU", på samme vilkår: hver plan har sin egen PDF, sine egne moduler og sine egne versioner, og en
     elev kan have begge planer (kontoret vælger EU ved oprettelse eller på holdet).
     "Undervisende kørelærere" (papirets side med alle lærernes underskrifter) viser kun de lærere, der har haft
     eleven, med deres underskrift. Har læreren ingen gemt underskrift, første gang læreren har eleven, sættes
     den på, når læreren gemmer den.
     Visning og print (afklaret med Michael 19. nov. 2026):
     - Eleven ser ikke selve modulplanen (6b er droppet). Eleven følger sit forløb i appen (moduler, lektioner
       mod minimum, start- og afslutningsdatoer og lærer), som er de samme oplysninger.
     - Alle lærere, kontoret og admin kan altid printe elevens modulplan, med de datoer, navne og underskrifter,
       der er sat indtil nu. Eleven kan ikke hente eller printe den.
     - Skolen printer den endelige plan, så eleven kan tage den med til den teoretiske og praktiske prøve
       (planen skal medbringes, og det skal være den seneste udgave). En påmindelse om at printe kan komme med
       i trin E7 (prøver og tjekliste).
  7. ~~Tegnet underskrift i PDF'en~~ Bygget med 6a (Færdselsstyrelsen har sagt ok).
- Første plan, før Michaels beslutning: Vixx udfylder den officielle PDF (stamdata, moduler, datoer,
  lærernavne), og læreren skriver under med kuglepen eller med digitalt ID i Adobe. Den tegnede underskrift,
  som Vixx lægger på automatisk, bygges først, når Færdselsstyrelsen har bekræftet den skriftligt.
- **Færdselsstyrelsen har sagt ok til den digitale underskrift (Michael, 19. nov. 2026).** Den tegnede
  underskrift kommer derfor med i del 6a.

#### E8-ombygning (bygget 21. nov. 2026, migration `20261121100000_fixed_courses_simple_scan`)
Kun Færdselsstyrelsens modulplan, gjort enkel (aftalt med Michael 20. nov. 2026):
- Faste forløb pr. skole: B, C, C/E, D (plan 1.1), EU og Taxa, oprettet automatisk (også for nye skoler).
  Eksisterende forløb med plan 1.1 er lagt sammen pr. kategori (elever, hold, tællinger og afslutninger flyttet);
  andre gamle forløb er slået fra og skjult, intet slettet. Låst som standard; admin "Lås op"/"Lås igen" (logges).
- Skolens kørelektioner (`module_lessons`, lektionsskemaet C + D, `add_lesson_schedule`, `copy_module_lessons`) er
  fjernet. Kan komme igen som tilvalg.
- Scanning: én skærm (`record_scan`, alt eller intet): moduler med fremskridt, antal, køreemner (afsnit 2, 7, 9),
  mørke via 7.19 med bekræftelse og lærerens underskrift, afslutning i samme tryk, "Overført" bag et link.
- Teori: "Teori registreres ved scanning" (til på B). Fra: teorien bekræftes ved afslutning (`theory_lessons`).
- Startdatoer gemmes på afslutningen (`started_on`); advarsel om undervisningsdage ved sidste modul.
- EU-flueben på eleven (`students.eu`); EU-modulerne og EU-scanning bygges, når blanketterne er her.
- "Undervisende kørelærere" på hold og elev (`plan_teachers`), øverst på planen.
- Mørkekørslens underskrift (Michael 21. nov. 2026): Vixx gemmer en kopi af den kørende lærers underskrift på
  kørslen (`dark_strokes`). Den skrives IKKE i styrelsens PDF, fordi blanketten ikke har et felt til den, og det er
  uvist, om vi må tilføje noget (Michael). Åbent: spørg koereuddannelse@fstyr.dk, før den kommer på den printede plan.

### Trin E9 – EU-lektionsplaner (aftalt med Michael 26. nov. 2026)
**E9a bygget 26. nov. 2026** (migration `20261126100000_eu_plans`): de fire forløb med emner og køretimer, valg på
eleven, scanning, EU-boks på elevens side og print. **E9b bygget 26. nov. 2026** (migration `20261126120000_eu_edit_tests`): ret emner/timer og læg ny blanket op (Lås op),
Lastsikring og Multitest i faktaboksen og på planen, EU på holdtavlen og i elevens app. Hver printet EU-udgave gemmes
(`module_plan_versions`, skabelon = forløbets navn).
Kilde: skolens fire blanketter i `C:\Users\admin\OneDrive\Skrivebord\EU\` (skolens egen Word-blanket med logo efter
styrelsens skabelon, BEK 322/2020; ingen udfyldbare felter).
- **Fire EU-dele, alle i brug:** Gods (grundlæggende/intensiv), Bus, "Personbefordring for lastbilchauffører" (3 uger,
  37 t heraf 3 køretimer) og den tilsvarende 3-ugers gods-del. Hvilken afhænger af elevens kørekort.
- **Fire selvstændige forløb under Forløb** (Michael 26. nov. 2026): EU Gods, EU Bus, EU Gods 3 uger og EU Bus 3 uger
  (erstatter det nuværende ene "EU"-forløb). Låst som de andre forløb: admin trykker "Lås op" for at lægge en ny PDF op,
  når blanketten ændres, og rette forløbets emner og timer (logges). Blanketten er ikke udfyldbar, så emnerne ligger i Vixx, og PDF'en gemmes som version/reference
  (senere evt. automatisk aflæsning med AI, som planlagt for Taxa).
- **Vælges på eleven** af kontoret (ingen, eller én EU-del). Aldrig på holdet: elever på samme hold kan have forskellige
  eller ingen EU-dele. Erstatter det nuværende EU-flueben (`students.eu`).
- **Emner:** hver EU-del har sine emner (fx 1.1 … 3.8 Repetition) med mål og **fast "faktisk anvendt tid"** som på
  blanketten (fx 1.2 = 12 t). Tiden rettes ikke i Vixx.
- **Scanning:** læreren scanner elevens QR-kode og bekræfter, hvilke EU-emner der er gennemført (og køretimer: dato,
  emne fx "Energirigtig kørsel", timer). Dato og lærer gemmes; lærerens gemte underskrift sættes på ved print.
- **Ingen elektronisk elevunderskrift** (for nu): planen printes til sidst, og eleven skriver under med kuglepen ved
  hvert emne og hver køretime.
- **Print:** Vixx laver selv PDF'en som en kopi af skolens blanket: forside (elevens navn og tlf.; CPR i hånden),
  lærerliste med gemte underskrifter, emner med dato, tid og underviserens underskrift, køretimetabel, tid i alt og
  prøvedatoer. Lærere, kontor og admin kan printe; eleven kan ikke.
- **Prøver:** praktisk prøve i lastsikring (gods) og Multitest kommer i faktaboksen og på planen.
- **Fremskridt:** EU tæller med i elevens fremskridt alle steder (elevens side, holdtavle, scanning, elevens app).
- EU er altid oven i et kørekortforløb i Vixx. En elev, der kun skal have EU (har kørekortet i forvejen), er meget
  sjælden; skolen printer en blank plan (Michael 26. nov. 2026). Intensiv eller grundlæggende afkrydses på planen ud
  fra EU-delen.

### Trin E10 – Skolens lektionsplan ved scanning (aftalt med Michael 26. nov. 2026; bygget 26. nov., migration `20261126140000_school_lessons`)
Skolens lektionsskema for C, D og C/E (samme skema til alle tre; B uændret). Læreren tænker kun i lektioner; Vixx
fordeler på modulerne og sætter underskrifterne det rigtige sted.
- **Lektionerne** (omdøbt 1, 2, 3 … fra papirets 2, 4, 6 …) med længde, punkter og kontrolstof:
  1 (papir 2, 2×45, øvelsesplads 2.1–2.5, bremser og styretøj) · 2 (4, 2×45, 7.1–7.5, 7.13–7.15 + rep. fra B, lygter
  og bærende dele) · 3 (6, 2×45, 7.2, 7.3, 7.6–7.9 + rep., motor og karosseri) · 4 (9, 2×45, 7.3, 7.9, 7.15, 7.16, 7.20,
  7.21, vægttavler) · 5 (11, 2×45, 7.17 + rep. 7.11–7.18, rep. af kontrolstof) · 6 (12, 1×45, 7.19 kørsel i mørke) ·
  7 (13, 1×45, rep. 7.1–7.18) · 8 (17, 1×45, evaluerende praktisk prøve, rep. 7.2–7.18) · 9 (18, 1×45, sidste kørsel
  før prøven, rep. af kontrolstof; 8 og 9 kan køres samlet) · KTA (4×45, afsnit 9, må køres når som helst i modul 3).
- **Fordeling:** modul 1 = lektion 1 + 2 + den første × 45 af lektion 3; modul 2 = den anden × 45 af lektion 3 +
  lektion 4 + 5; modul 3 = lektion 6, 7, 8, 9 og KTA. Minimum passer: 5 / 5 / 8.
- **Mørke flyttes til modul 3** på C og D (skolens valg 26. nov. 2026; i Vixx' plan 1.1 står 7.19 i modul 2, men
  PDF'en har intet mørkefelt). C/E har intet mørkekrav i planen.
- **Afslutning:** når en lektion bringer modulet op på minimum (alle modulets lektioner kørt), afslutter den, der kører
  den, modulet med sin underskrift. Kun ved den lektion vises "Denne lektion afslutter modul X" med erklæring og
  "Teorilektioner i modulet" (minimum, kan rettes op). Køres lektionerne i en anden rækkefølge, tæller Vixx lektionen
  og afslutter modulet, når den sidste manglende lektion køres.
- **Scanning:** læreren vælger lektionen (Vixx foreslår den næste), ser punkterne med flueben (fjern ved "ikke
  gennemført") og bekræfter. 7.19 og KTA bekræftes som nu ("Ja, kørt i mørke" / "Ja, kørt på køreteknisk anlæg").
- **Print:** modulplanen som nu (afsluttende lærers underskrift pr. modul, undervisende kørelærere øverst) + ny
  **lektionsplan** med dato og den kørende lærers underskrift pr. lektion; eleven skriver under med kuglepen.
- **Fremskridt = lektionsplanen** (Michael 26. nov. 2026): under forløbet ser lærer, kontor og elev kun, hvor langt
  eleven er i lektionsplanen (lektion 1–9 og KTA: kørt / mangler, med dato og lærer), ikke modulerne. Det gælder
  scanning, elevens side, holdtavlen, fremskridtsbjælken og elevens app. Modulerne regnes stadig ud bag ved til
  afslutning og underskrift, og modulplanen printes som før.
- **KTA og Mørke i faktaboksen** bliver grønne af sig selv, når KTA-lektionen og mørkelektionen (lektion 6) er
  bekræftet; ingen manuel markering nødvendig.

### Trin E11 – Planlæg fra holdtavlen (aftalt med Michael 27. nov. 2026; bygget 27. nov., migration `20261127100000_plan_from_board`)
- Alle (admin, kontor og lærere) kan trykke på et manglende felt på holdtavlen og planlægge det i en lille boks uden at gå ind på eleven.
- Lektion 1–9, KTA (lektionsplanen) og EU-køretimer: underviser, dato (i dag og frem) og starttid fra skolens lektionsplan (optagede tider kan ikke vælges). Bliver en planlagt lektion (`scheduled_lessons` med `school_lesson_id`/`eu_topic_id`, uden ydelse, `note` = lektionens navn) i lærerens og elevens kalender. Feltet bliver gult med datoen.
- **Adskilt fra lønnen:** ingen ydelse og ingen "Udført"-knap på den; læreren registrerer stadig selv timer og lektioner.
- Flere elever: har læreren allerede samme lektion på samme tid (fx KTA), vises tiden som "sæt eleven på", og eleven føjes til lektionen i stedet for at låse læreren.
- Teoriprøve, køreprøve, Lastsikring og Multitest (og KTA/Mørke på B) bliver aftaler på eleven (`student_appointments`) med dato, evt. klokkeslæt og adresse.

### Idéer (aftalt 14. nov. 2026, ikke prioriteret endnu)
- Tilmelding af nye elever fra skolens hjemmeside: eleven udfylder en formular, kontoret godkender, og eleven
  oprettes med login. Frivilligt afsnit "Hensyn" (ordblind, farveblind, nedsat hørelse, koncentrationsbesvær,
  andet + fritekst). Det er helbredsoplysninger: udtrykkeligt samtykke, kun kontor og elevens lærere kan se dem,
  aldrig i ændringsloggen, slettes automatisk efter afsluttet forløb, og eleven kan se og rette dem selv.
  Lærerne ser et mærke ("Hensyn: Ordblind") ved scanning og i skemaet.
- Materialer (vidensbank, aftalt 18. nov. 2026): "Mine materialer" er privat for hver lærer og kontorbruger.
  "Skolens materialer" er i mapper, som kun admin opretter, omdøber, flytter og lukker (fx B, C/E, Taxa,
  EU/AMU, med undermapper). Alle lærere og kontor kan lægge filer eller links i admins mapper og se og downloade
  alt dér. Man deler fra "Mine" ved at vælge mappen fra admins liste (mappe skal vælges; intet "diverse").
  Ligger det forkert, kan ejeren selv flytte det, og admin og kontor kan også flytte det. Man retter og sletter sit eget, og admin og
  kontor kan rydde op. En mappe med indhold kan kun lukkes, ikke slettes. Hvem og hvornår vises.
  Påmindelse om ophavsret ved upload. Filer i Supabase Storage med RLS pr. skole (gratis plan: 1 GB, 50 MB pr.
  fil, så video som links). Senere: deling med elever og kobling til modulplanens moduler.
- Quiz (aftalt 18. nov. 2026, "Kahoot-idéen", men vi bruger ikke navnet Kahoot):
  - Lærere og kontor laver quizzer med 2–4 svar, det rigtige svar, valgfrit billede (fx færdselstavle) og tid
    pr. spørgsmål. Quizzer gemmes som materialer: private, eller delt i admins mapper til genbrug.
  - Egen quiz-sektion på storskærmen: læreren starter den, og storskærmen viser QR-kode og kort kode,
    spørgsmål, nedtælling, svarfordeling og pointtavle. Live-opdatering via Supabase Realtime.
  - Eleverne svarer på telefonen. Gæster deltager uden login med et kaldenavn, og deres resultat gemmes kun
    samlet for quizzen. Elever med login vælger også et kaldenavn (Vixx husker det), og deres resultat gemmes
    på eleven og ses i elevens app og af læreren.
  - Storskærmen viser aldrig rigtige navne, kun kaldenavne. Læreren kan fjerne en deltager.
  - Bagefter ser læreren, hvilke spørgsmål holdet havde svært ved.
  - Senere: quiz som hjemmeopgave i eget tempo.
- Teori-fremmøde med én QR-kode i lokalet/på storskærmen; læreren godkender holdet med ét tryk.
- "Jeg er syg" fra lærer-appen med overblik over berørte lektioner og omfordeling.
- Lærerens interne noter pr. elev (ses af næste lærer ved scanning).
- Venteliste på afbud hos samme lærer.
- Advarsel om elever, der er gået i stå (og modulplanens afbrydelsesregler).

### Senere
- Teoriundervisning i systemet. Betaling og saldo pr. elev (venter, aftalt 12. nov. 2026).

---

## Åbne spørgsmål til skolen
- Kronebeløb pr. ydelse, og om de er ens for alle lærere.
- Fordeling af ydelser på satser (især Soldater, Rybners, Diverse) og tillæg for aften/mørke.
- Eksempel på Dataløn-importfil og skolens løndele.
- Navne på kontorbrugere og hvem der er admin.
- Gæstelærere og faktura. Motorcykler (kategori A). Køretøj til Rybners.
