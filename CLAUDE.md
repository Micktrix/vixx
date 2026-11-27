# Vixx – planlægning og timeregistrering for køreskoler

Læs denne fil før hver opgave. Den er projektets "sandhed". Hvis noget i koden strider mod den, så spørg før du ændrer.

## Hvad vi bygger
Vixx er en webapp til køreskoler:
- **Kontor** (computer): planlægger lektioner, godkender lærernes registreringer, laver lønoverblik og eksport til Dataløn.
- **Lærer** (telefon): ser sit skema, registrerer kørte lektioner, søger ferie, melder "Kan arbejde".

Første kunde er én køreskole (pilot), men systemet bygges fra dag ét til **flere køreskoler** med adskilte data. Senere kommer en elevdel (booking, forløb, teori og prøver) på samme platform.

Reference for skærme og flow: `docs/prototype.html` (åbn i browser). Prototypen er en tegning, ikke kode der skal genbruges.

## Teknik
- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**.
- **Supabase**: Postgres, Auth, Row Level Security (RLS). Region: EU.
- **Vercel** til hosting (EU-region). Domæne: `vixx.dk`.
- **PWA**: appen kan lægges på telefonens hjemmeskærm. (Push kommer i en senere fase.)
- Ét kodebase til både kontor og lærer. Mobil-først for lærerdelen, desktop-først for kontordelen.

## Miljøer
| Miljø | Hvor | Database | Data |
|---|---|---|---|
| Udvikling | lokalt (`npm run dev`) | Supabase lokalt via CLI | kun testdata (seed) |
| Test | `test.vixx.dk` | eget Supabase-projekt | kun testdata – kun til Michael og udviklingen |
| Drift | `app.vixx.dk` | eget Supabase-projekt | rigtige data – kun her logger skolerne ind |

- Ændringer prøves altid på test først og kommer først i drift, når Michael siger til. Ingen rigtige personer eller rigtige data på test.

- Databaseændringer laves **kun** som migrationer i `supabase/migrations/`. Ret aldrig direkte i test eller drift.
- Hemmeligheder ligger i `.env.local` / Vercel-miljøvariabler, aldrig i git.

## Sprog og stil
- **Al tekst i brugerfladen er på dansk.** Kort, venlig og konkret. Datoer som "Torsdag 29. oktober". Tid som "08:00–10:15". Beløb som "1.820 kr.".
- Kode, tabeller og variabelnavne på **engelsk**.
- Lys, rolig farvepalet (se prototypen): varm lys baggrund, hvide flader, én orange accentfarve (#DD7434), dæmpede statusfarver. Ingen navy, ingen mørk tilstand foreløbig.

## Multi-tenant og sikkerhed (vigtigst)
- Alle forretningstabeller har `school_id`. **RLS er slået til på alle tabeller**, og en bruger kan kun se data fra sin egen skole.
- Roller pr. skole: `admin` (superadmin for skolen), `office` (kontor), `instructor` (lærer). Platformens ejer (Michael) har en separat `platform_owner`-rolle.
- Rettigheder (foreløbigt):
  - `admin`: alt: godkendelser, lønoverblik og Dataløn, lønperioder, ferie-afgørelser, undervisere og roller, ydelser og satser, forløb, alle indstillinger, ændringslog, storskærm og oprydning i delte materialer og quizzer.
  - `office` (kontoret er som en lærer, aftalt 19. nov. 2026): kalender og planlægning (lektioner og fravær for alle lærere), elever og hold, lokaler og køretøjer, beskeder, og materialer og quiz som lærerne. Ingen godkendelser, løn, ferie-afgørelser, undervisere, satser, indstillinger, ændringslog eller storskærm.
  - `instructor` (alle lærere har kontorets adgang, aftalt 21. nov. 2026): alt det, `office` kan, plus egne data – skema, registreringer, ferieanmodning, "Kan arbejde", egne kontakt- og pårørendeoplysninger. Kontordelen og lærerdelen er ikke rettigheder, men skærme: kontordelen til computeren, lærerdelen til telefonen. Kun admin-delene er lukkede (`private.is_staff` omfatter lærerne).
  - `student` (elev): ligger i tabellen `students`, ikke i `school_members`, så eleven ikke rammer "medlemmer ser …"-reglerne. Eleven ser kun sig selv, sit hold, sin skole og forløbene, og lander i elevens app (`/elev`). Kontoret opretter hold og elever; lærerne kan se skolens elever.
- Skriv RLS-politikker og test dem. Ingen forretningslogik der kun er sikret i frontend.

## Login
- **Brugernavn = telefonnummer** (gemmes som E.164, fx `+4520456789`). Unikt pr. person.
- **Nu (test):** telefonnummer + kode. Første kode er personens eget telefonnummer (fx `20456789`), så telefonnummeret er både brugernavn og første kode. Ved første login skal man vælge egen kode (ikke telefonnummeret). Kontoret kan nulstille koden (til telefonnummeret igen) og logge læreren ud af alle enheder.
- **Senere:** engangskode på SMS. Byg login, så metoden kan skiftes uden at ændre brugere eller data (telefonnummeret er identiteten).
- Kontorbrugere har hver deres login, så det altid fremgår, hvem der har gjort hvad.

## Forretningsregler (skal overholdes)
**Lektioner og tid**
- En lektion er som standard 45 min (indstilling pr. skole).
- **Lektionsplan** pr. skole (indstilling): faste starttider med pauser, standard 08:00 08:45 | 10:00 10:45 | 12:00 12:45 | 13:45 14:30. Man kan kun planlægge/registrere fra planens starttider, og flere lektioner følger planen med pauserne (8 lektioner fra 08:00 slutter 15:15). Ud over planens sidste tid fortsætter lektionerne uden pause.
- Sluttiden gemmes på lektionen (`span_minutes`), så en senere ændring af planen ikke flytter gamle lektioner. Læreren er optaget hele blokken, også i pauserne.
- Ny planlægning foreslår første ledige starttid i planen; optagede tider kan ikke vælges.
- Ingen overlap: en lærer kan ikke have to lektioner, eller lektion og fravær, samtidig. Samme for lokaler og køretøjer.

**Planlagt vs. registreret**
- *Planlagt lektion* (`scheduled_lessons`): lagt ind af kontoret eller af læreren selv (frem i tiden). Viser at læreren er optaget. Tæller **ikke** i lønnen.
- *Registrering* (`registrations`): læreren melder en kørt lektion (fx via "Udført"). Kan kun laves for i dag eller tidligere.
- Kun **godkendte** registreringer tæller i lønnen.
- Registrering uden planlagt lektion markeres "uplanlagt". Afvigelse mellem planlagt og registreret antal markeres.
- **"Til løn" og "Planlæg" er adskilt** (27. nov. 2026, til afprøvning på test): en kørt planlagt lektion sendes med knappen "Til løn" på lektionen (læreren vælger selv ydelsen; tid, antal og note "Lektion 6 (mørke) · Thomas" er udfyldt). "Tilføj lektioner" er kun til løn for det, der ikke var planlagt. Registreringer har ingen elevvalg, kun en note; eleverne står på den planlagte lektion. "Planlæg" i lærerens app: vælg eleven og planlæg det, eleven mangler i lektionsplanen/EU (samme boks som holdtavlen); "Anden lektion" (med ydelse) ligger bag et link. Forsiden viser "X kørte lektioner mangler at komme på løn".

**Godkendelse**
- Status: `pending` (afventer), `approved` (godkendt), `rejected` (afvist med kommentar).
- Ved godkendelse/afvisning gemmes **hvem og hvornår**.
- Ved godkendelse **låses prisen** på registreringen (`locked_price`). Senere prisændringer rører den ikke.
- Afvist lektion kan rettes og sendes igen af læreren, eller rettes og godkendes direkte af admin (læreren får besked).

**Ydelser og satser**
- *Ydelse* = det der vælges ved planlægning/registrering (fx "Amu-teori", "C privat", "Aften Amu C/E"). En ydelse er kun **navn, sats og Dataløn-løndel**. Der er ingen kategorier eller typer (fjernet 11. nov. 2026 for at gøre det enkelt).
- *Sats* = beløbet pr. lektion. Den sidder direkte på ydelsen og har **gyldig-fra-dato** (historik). Flere ydelser må gerne have samme sats. Der findes ingen separate sats-grupper.
- En lærer kan have egen sats på en ydelse (override).
- Beregning: låst sats hvis godkendt → ellers lærerens egen sats → ellers ydelsens sats gældende på lektionens dato.
- En ydelse der er brugt kan kun **slås fra**, ikke slettes.
- Ydelser og satser vedligeholdes af skolen selv i systemet.

**Lønperiode og eksport**
- Lønperiode: den 21. til den 20. (indstilling pr. skole).
- En periode kan låses; derefter kan intet i den ændres. Kun `admin` kan låse op, og det logges.
- Dataløn-eksport: CSV med én linje pr. lærer pr. ydelse: medarbejdernr., navn, løndel (fra ydelsen), tekst, antal, sats, beløb. Endeligt format afklares ud fra skolens importfil ("fleksible løndele").
- Gæstelærere afregnes via faktura og er **ikke** med i Dataløn-eksporten.

**Tilgængelighed**
- Lærere har ingen kompetencer i systemet: alle aktive lærere kan planlægges/registrere alle aktive ydelser. Skolen holder selv styr på, hvem der kan hvad. (Når elevdelen kommer, kobles elever på en lærer, der passer til kørekortet.)
- Tilgængelighed: `fixed` (de fleste – tilgængelig alle dage) eller `on_request` ("Efter aftale"). Lærere på "Efter aftale" melder "Kan arbejde" på valgte datoer med tidsrum, og vises kun som ledige der.
- "Find ledig underviser": dato, tid, antal → alle lærere, ledige først.

**Fravær og ferie**
- Fravær (kontoret): årsag (Syg, Fri, Andet), start, antal timer, note. Blokerer tiden. Tæller aldrig i lønnen.
- Ferie: læreren anmoder, admin godkender/afviser. Godkendt ferie blokerer dagene og giver ingen påmindelser.

**Lokaler og køretøjer**
- Ressourcer pr. skole: lokaler og køretøjer (kun navn; ingen kategorier eller typer).
- En lektion kan få et lokale eller køretøj; optagede kan ikke vælges. Flyttes/slettes lektionen, følger bookingen med.
- Lærere kan booke ledige lokaler/køretøjer frit og kun rette/slette egne bookinger.

**Elever (i gang, se Fase 3 i BYGGEPLAN)**
- Lektioner og registreringer har en liste af elever (`student_ids`, fx flere elever på KTA/kravlegård) og et fritekstfelt `student_name` til elever, der ikke er i Vixx. Lønnen er pr. time, uanset antal elever.
- *Forløb* (`courses`, `course_modules`): FASTE forløb pr. skole (ombygning 21. nov. 2026): B, C, C/E, D (Færdselsstyrelsens plan 1.1), EU og Taxa, oprettet automatisk med skolen. Intet "Nyt forløb" og ingen navngivning; nye typer kodes ind. Hvert forløb kan slås til og fra. Forløbene er **låst**: moduler, minimum, emner og modulplanens PDF kan kun rettes, når admin har trykket "Lås op" (logges). Indstillingen "Teori registreres ved scanning" (til på B, fra på C, C/E og D). Taxa har ingen plan endnu. Detaljer: BYGGEPLAN trin E8.
- Afslutning sker i SAMME scanning: når det valgte antal bringer modulet op på minimum, skifter knappen til "Bekræft og afslut modul X" med erklæring (og "Teorilektioner i modulet", udfyldt med minimum, når teori ikke scannes; ikke under minimum medmindre "Overført fra lektionsplan", som ligger bag et lille link). Alt eller intet (`record_scan`). Den afsluttende lærers gemte underskrift kommer på. Modulerne afsluttes i rækkefølge. En afslutning kan ikke ændres eller slettes; kun admin kan annullere den med begrundelse. Læreren kan også afslutte det aktuelle modul uden ny scanning fra elevens side på computeren (samme regler og egen underskrift); gæstelærere oprettes som undervisere og scanner selv (21. nov. 2026). Et afsluttet hold kan ikke få nye elever.
- Demo-elev (`students.is_demo`): en fiktiv elev "Demo Elev" (egen bruger, som ingen logger ind som) under admins fane "Elev", der viser elevens skærm med test-QR-kode. Højst én pr. skole, vises ikke i elevlister og kommer aldrig på lønnen.
- Elever vælges på lektionen fra en liste med kun aktive elever (lærerens faste elever først), så lektionen kommer i hver elevs kalender.
- **Lektioner og timer er adskilt** (aftalt 18. nov. 2026): QR-scanning tæller kun i elevens modulplan. Timen til lønnen registrerer læreren i kalenderen ("Udført"/"Tilføj lektioner") med eleverne på.
- Afslut forløb (`students.finished_on`, `finish_reason`: bestået køreprøve/stoppet/andet): eleven bliver inaktiv og logges ud, men intet slettes, og eleven kan findes med søgningen. Kontoret kan genåbne.
- Skolens kørelektioner under modulerne er fjernet (21. nov. 2026). Ved scanning ser læreren modulets KØREEMNER (afsnit 2, 7 og 9) med flueben fra start og fjerner fluebenet ved det, der ikke blev kørt; grønt = kørt, rødt = mangler. Køreemner, der ikke er kørt, giver kun en advarsel ved afslutning.
- **Mørke**: intet "I mørke"-flueben. I moduler med mørke-krav har 7.19 ikke flueben fra start og skal bekræftes ("Ja, kørt i mørke"); kravet er opfyldt, når 7.19 er bekræftet, ellers kan modulet ikke afsluttes. Mørkekørslen får sin egen underskrift: en kopi af den kørende lærers gemte underskrift (`module_signoffs.dark_strokes`, kan ikke læses via API'et). Den skrives ikke i Færdselsstyrelsens PDF (ingen felt; spørg styrelsen først). Vixx skriver kun i blankettens egne felter.
- **EU-lektionsplaner** (trin E9a, 26. nov. 2026): fire faste forløb EU Gods, EU Bus, EU Gods 3 uger og EU Bus 3 uger med emner (`eu_topics`) og fast "faktisk anvendt tid" fra skolens blanketter (BEK 322/2020). Kontoret vælger ét EU-forløb på eleven (`students.eu_course_id`) oven i kørekortforløbet, aldrig på holdet, og et EU-forløb kan aldrig være elevens kørekortforløb. Læreren scanner og bekræfter gennemførte emner og køretimer (`record_eu_scan`, `eu_signoffs`, én gang pr. emne); dato, navn og en kopi af lærerens gemte underskrift gemmes. Læreren kan også krydse EU-emner og køretimer af på elevens side på computeren med valgt dato, i dag eller tidligere (`record_eu_signoffs`, trin E9c); ikke på holdet, fordi EU vælges pr. elev. Ved scanning vises kun de manglende lektioner og EU-emner; eleven ser alt det kørte i appen. EU-planen printes som en kopi af blanketten (`/api/eu-plan/<elev>`); eleven skriver under med kuglepen, og CPR skrives i hånden. Elever med kun EU (sjældent) får en blank papirplan. Fluebenet `students.eu` bruges ikke længere. Admin retter EU-emner og -timer og lægger skolens nye blanket op (`eu_plan_files`), når forløbet er låst op (trin E9b). Prøverne Lastsikring (EU Gods) og Multitest (alle EU) er aftaler i faktaboksen og kommer på planen. EU vises også på holdtavlen (timer) og i elevens app.
- **Skolens lektionsplan** (trin E10, 26. nov. 2026) for C, D og C/E (samme skema; B uændret): lektion 1–9 og KTA (`school_lessons`, med længde, punkter og kontrolstof; papirets 2, 4, 6, 9, 11, 12, 13, 17, 18). Læreren vælger lektionen ved scanning (`record_lesson_scan`, `lesson_signoffs` med kopi af underskriften); Vixx fordeler enhederne på modulerne (modul 1 = lektion 1, 2 og første halvdel af 3; modul 2 = anden halvdel af 3, lektion 4 og 5; modul 3 = lektion 6–9 og KTA (4×45)). Den lektion, der fuldfører et modul, viser erklæring og teori og afslutter modulet med den kørende lærers underskrift; i en anden rækkefølge afsluttes modulet, når den sidste manglende lektion køres. **Mørke er flyttet til modul 3 på C og D** (skolens valg). Fremskridt vises som lektionsplanen alle steder (scanning, elevens side, holdtavle, elevens app); modulerne bruges bag ved og til modulplanen. Lektionsplanen printes med dato og den kørende lærers underskrift pr. lektion (`/api/lektionsplan/<elev>`); eleven skriver under med kuglepen.
- **Planlæg fra holdtavlen** (trin E11, 27. nov. 2026): tryk på et manglende felt (lektion 1–9, KTA, EU-køretime) og vælg underviser, dato og starttid; det bliver en planlagt lektion uden ydelse (`scheduled_lessons.school_lesson_id`/`eu_topic_id`) i lærerens og elevens kalender, adskilt fra lønnen (læreren registrerer selv timerne). Har læreren samme lektion på samme tid, sættes eleven på (flere elever på KTA). Prøverne bliver aftaler på eleven. Alle kan planlægge.
- **KTA** (21. nov. 2026): afsnit 9 (køreteknisk anlæg) i sidste modul (B modul 5, C/C-E/D modul 3) behandles som mørke: intet flueben fra start, bekræftes med "Ja, kørt på køreteknisk anlæg", og modulet kan ikke afsluttes uden (scannet eller markeret gennemført i faktaboksen), medmindre "Overført fra lektionsplan". Ved overskud bliver KTA- og mørkelektionen i modulet.
- Startdato: modul 1 = holdets startdato, ellers elevens oprettelsesdato (kontoret kan rette den på eleven, `students.course_start_on`). De øvrige moduler: første kørsel (kan rettes ved afslutning). Ved sidste modul advarer Vixx, hvis undervisningsdagene er under minimum (B 14, C og D 12, C/E 10): scanningsdage, når teori scannes, ellers hverdage fra start.
- "Undervisende kørelærere" (`plan_teachers`): kontoret vælger dem på holdet (alle holdets elever) eller på eleven uden hold; de kommer øverst på modulplanen med navn og gemt underskrift. Lærere, der scanner eleven, kommer selv på listen.
- Tælling i moduler (`module_signoffs`): læreren scanner og vælger modul (modulerne vises én gang med fremskridt; Vixx foreslår det aktuelle), evt. teori (kun når teori scannes), antal (1 lektion = 45 min.) og evt. manuelt gear (kode 78). Knappen hedder "Bekræft N kørselslektioner"/"Bekræft N teorilektioner". Lærerens scanning er nok; eleven skriver ikke under. Går ikke til lønnen og kan ikke slettes; admin kan rette. Elevens underskrift i appen kommer senere med taxa og EU.
- Kørelektioner (trin E5): eleven har faste lærere (`student_instructors`) og evt. flueben `can_request`. Læreren åbner tider (`open_slots`), eleven anmoder (`lesson_requests`), læreren godkender (= planlagt lektion med `student_id`) eller afviser. Afbud inden skolens frist (`schools.cancel_hours`). Eleven læser og handler via `student_*`-funktionerne, aldrig direkte i lærernes skema. Alle elever har kalender og iCal-abonnement.
- Modulplanen (PDF): Vixx udfylder Færdselsstyrelsens udfyldbare PDF med lærernes underskrifter. Lærere, kontor og admin kan altid printe; eleven kan ikke hente den. Hver udgave gemmes og slettes aldrig.

- **Aftaler og faktaboks** (21. nov. 2026, `student_appointments`): KTA, mørkekørsel, teoriprøve og køreprøve med dato, klokkeslæt og adresse på eleven. Blandes ikke med lærernes skema eller timer. Lærere og kontor skriver dem ind og ser dem (elevens side og ved scanning); eleven ser sine egne i appen. Faktaboks: grå = intet, gul = booket, grøn = gennemført/bestået. KTA (afsnit 9 kørt) og Mørke (7.19 bekræftet) bliver grønne af sig selv ved scanning eller kan markeres gennemført. "Ikke bestået" gemmes som historik, og en ny dato starter forfra. Et udfald kan ikke ændres; kun bookede aftaler kan slettes. Bestået køreprøve foreslår "Afslut forløb".
- Modulerne kan rulles ud på elevens side (kontor og lærerens scanning): køreemner (kørt/mangler), mørke, teori og hver scanning med dato, antal og lærer.

**Vidensbank og quiz** (bygget 18. nov. 2026)
- Materialer (`material_folders`, `materials`): "Mine materialer" er private. Skolens mapper oprettes kun af admin. Alle lærere og kontor lægger op i dem og kan se og hente alt. Ejeren retter og sletter sit eget, og admin rydder op. Filerne ligger i Storage-bucketten `materials`, som kun serveren tilgår (tidsbegrænsede links). Højst 50 MB pr. fil, og video lægges ind som link. Elever har ingen adgang.
- Quiz (`quizzes`, `quiz_questions`, `quiz_sessions`, `quiz_players`, `quiz_answers`): lærere og kontor laver quizzer (private eller delt med fluebenet "Del med de andre lærere"; billeder på spørgsmål og svar) og kører dem på storskærmen (`/quiz/vis/<runde>`). Deltagere går til `/q/<kode>` uden login og vælger et kaldenavn. Er de logget ind som elev, kobles resultatet på eleven. Skærmene viser kun kaldenavne. Deltagerne handler kun via `quiz_join`/`quiz_player_state`/`quiz_answer` med en hemmelig nøgle.

**Log og privatliv**
- Alle ændringer skrives i en ændringslog (hvem, hvornår, hvad). Følsomme værdier skrives ikke i loggen.
- Backup af timer: hver nat sendes en CSV med registreringer (igangværende + forrige lønperiode, alle statusser, uden elevnavne/noter) til en backup-e-mail, som kun admin kan se og rette. Ændring giver besked til den gamle adresse.
- Gem **ikke** CPR eller bankoplysninger (løn udbetales via Dataløn til NemKonto).
- Storskærm/dashboard viser aldrig elevnavne.

## Arbejdsform
- Følg `docs/BYGGEPLAN.md`. Byg **ét trin ad gangen**, og stop efter hvert trin med en kort status: hvad er lavet, hvordan testes det, hvad mangler.
- Tilføj ikke funktioner fra senere faser uden at spørge.
- Hvert trin: migration + RLS + seed-data + skærm + tests af de vigtigste regler.
- Skriv korte, læsbare komponenter. Hellere enkelt og rigtigt end smart.
- Når en regel er uklar: spørg, gæt ikke.
