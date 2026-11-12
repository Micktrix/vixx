import type { Metadata } from "next";
import type { ReactNode } from "react";
import { icons } from "@/components/icons";
import { LogoMark } from "@/components/logo-mark";

// Den offentlige forside på vixx.dk (src/proxy.ts viser den på "/" for vixx.dk og www.vixx.dk).
// Appen ligger på sit eget domæne; skift APP_URL til app.vixx.dk, når driften starter.
const APP_URL = "https://test.vixx.dk";
const CONTACT = "info@vixx.dk";
const DEMO_MAIL = `mailto:${CONTACT}?subject=${encodeURIComponent("Demo af Vixx")}`;

export const metadata: Metadata = {
  title: "Vixx – planlægning og timeregistrering til køreskoler",
  description:
    "Kontoret planlægger, lærerne registrerer fra telefonen, eleverne følger deres forløb, og lønnen er klar til Dataløn. Alt samlet ét sted.",
};

const primary = "inline-flex h-12 items-center rounded-[14px] border border-accent bg-accent px-5 text-[15px] font-bold text-ink";
const secondary = "inline-flex h-12 items-center rounded-[14px] border border-line2 bg-surface px-5 text-[15px] font-bold";

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <nav className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-5 py-5">
        <span className="flex items-center gap-3">
          <LogoMark />
          <b className="text-xl">Vixx</b>
        </span>
        <span className="flex items-center gap-5 text-[15px] font-semibold">
          <a href="#funktioner" className="hidden text-muted hover:text-ink sm:inline">
            Funktioner
          </a>
          <a href="#eleven" className="hidden text-muted hover:text-ink sm:inline">
            Til eleven
          </a>
          <a href="#kontakt" className="hidden text-muted hover:text-ink sm:inline">
            Kontakt
          </a>
          <a href={APP_URL} className="inline-flex h-10 items-center rounded-xl border border-line2 bg-surface px-4">
            Log ind
          </a>
        </span>
      </nav>

      <header className="mx-auto grid w-full max-w-[1120px] items-center gap-10 px-5 pt-8 pb-16 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-5">
          <p className="w-fit rounded-full border border-accent-line bg-accent-bg px-3 py-1 text-sm font-semibold text-accent-ink">
            Til køreskoler
          </p>
          <h1 className="text-[40px] leading-[1.1] font-bold sm:text-[52px]">Planlægning og timeregistrering, samlet ét sted</h1>
          <p className="max-w-[520px] text-lg text-muted">
            Kontoret planlægger, lærerne registrerer fra telefonen, eleverne følger deres forløb, og lønnen er klar til Dataløn. Slut med
            papirsedler og regneark.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={DEMO_MAIL} className={primary}>
              Book en demo
            </a>
            <a href="#funktioner" className={secondary}>
              Se hvad Vixx kan
            </a>
          </div>
        </div>
        <PhoneMock />
      </header>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-[1120px] gap-6 px-5 py-14 md:grid-cols-3">
          <Role
            icon={icons.chart}
            title="Kontoret"
            text="Planlæg lektioner efter skolens lektionsplan, godkend lærernes timer, og få lønoverblik og eksport til Dataløn på få minutter."
          />
          <Role
            icon={icons.calendar}
            title="Læreren"
            text='Se dagens skema på telefonen, tryk "Udført", når lektionen er kørt, søg ferie og meld, hvornår du kan arbejde.'
          />
          <Role
            icon={icons.scan}
            title="Eleven"
            text="Følg forløbet lektion for lektion, vis en QR-kode til kørelæreren efter lektionen, og bekræft i appen, at den er gennemført."
          />
        </div>
      </section>

      <section id="funktioner" className="mx-auto flex w-full max-w-[1120px] scroll-mt-6 flex-col gap-8 px-5 py-16">
        <div className="flex max-w-[640px] flex-col gap-2">
          <h2 className="text-[32px] font-bold">Bygget til hverdagen på en køreskole</h2>
          <p className="text-lg text-muted">Vixx er lavet sammen med en køreskole og følger de regler, kontoret allerede arbejder efter.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature title="Planlægning uden overlap">
            Faste starttider med pauser. Vixx foreslår første ledige tid og forhindrer, at en lærer, et lokale eller en bil bliver dobbeltbooket.
          </Feature>
          <Feature title="Registrering fra telefonen">
            Læreren melder kørte lektioner med ét tryk. Uplanlagte lektioner og afvigelser fra skemaet bliver markeret for kontoret.
          </Feature>
          <Feature title="Godkendelse med låste satser">
            Kontoret godkender eller afviser med kommentar. Satsen låses ved godkendelsen, så senere prisændringer ikke rører lønnen.
          </Feature>
          <Feature title="Lønoverblik og Dataløn">
            Lønperioder fra den 21. til den 20., låsning af perioder og eksport med én linje pr. lærer pr. ydelse.
          </Feature>
          <Feature title='Ferie, fravær og "Kan arbejde"'>
            Lærerne søger ferie i appen, kontoret registrerer sygdom og fri, og lærere på aftale melder, hvornår de kan.
          </Feature>
          <Feature title="Lokaler og køretøjer">
            Book biler og lokaler sammen med lektionen. Bookingen flytter med, når lektionen flyttes.
          </Feature>
          <Feature title="Kalender i telefonen">
            Lærerens lektioner kan abonneres på i telefonens egen kalender, uden elevnavne.
          </Feature>
          <Feature title="Storskærm til kontoret">
            Dagens overblik over lærere, lokaler og biler på en skærm på væggen. Elevnavne vises aldrig.
          </Feature>
          <Feature title="Uge- og timesedler">
            Print en ugeseddel eller en timeseddel for lønperioden, pr. lærer eller samlet for alle.
          </Feature>
        </div>
      </section>

      <section id="eleven" className="scroll-mt-6 border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-10 px-5 py-16 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-[32px] font-bold">Elevens lektionsplan, uden papir</h2>
            <p className="text-lg text-muted">
              Skolen bygger selv forløbene pr. kørekortkategori, så de kan rettes, når der kommer nye krav. Efter lektionen scanner
              kørelæreren elevens QR-kode og kvitterer, og eleven bekræfter i sin app. To underskrifter, som på papiret.
            </p>
            <ul className="flex flex-col gap-2 text-[15px]">
              <Check>Kørselslektioner går til lønnen i samme tryk</Check>
              <Check>Punkter, der ikke blev nået, bliver noteret</Check>
              <Check>Kontoret ser hvert holds fremskridt på én tavle</Check>
              <Check>En kvittering kan aldrig slettes</Check>
            </ul>
          </div>
          <div className="grid grid-cols-6 gap-1.5 rounded-[20px] border border-line bg-bg p-5" aria-hidden="true">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((n, i) => (
              <span
                key={n}
                className={`flex aspect-square items-center justify-center rounded-lg text-sm font-bold ${
                  i < 7 ? "bg-ok text-white" : i === 7 ? "bg-accent text-ink" : "border border-line2 bg-surface text-muted"
                }`}
              >
                {n}
              </span>
            ))}
            <p className="col-span-6 mt-2 text-[13px] text-muted">Grøn: gennemført · Orange: venter på elevens bekræftelse · Grå: mangler</p>
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-16">
        <h2 className="text-[32px] font-bold">Sikkert og dansk</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature title="Data i EU">Vixx og databasen kører på servere i EU.</Feature>
          <Feature title="Adskilte skoler">Hver skole ser kun sine egne data. Det sikres i databasen, ikke kun i appen.</Feature>
          <Feature title="Ingen CPR eller bank">Lønnen udbetales via Dataløn, så Vixx gemmer hverken CPR-numre eller kontonumre.</Feature>
          <Feature title="Ændringslog">Alle ændringer gemmes med hvem og hvornår, og timerne sendes som backup hver nat.</Feature>
        </div>
      </section>

      <section id="kontakt" className="scroll-mt-6 px-5 pb-16">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-start gap-4 rounded-[24px] border border-accent-line bg-accent-bg p-8 sm:p-10">
          <h2 className="text-[30px] font-bold">Vil du se Vixx i brug?</h2>
          <p className="max-w-[560px] text-lg">Skriv til os, så viser vi, hvordan Vixx kan bruges på jeres køreskole.</p>
          <a href={DEMO_MAIL} className={primary}>
            Skriv til {CONTACT}
          </a>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} Vixx</span>
          <span className="flex gap-4">
            <a href={`mailto:${CONTACT}`} className="hover:text-ink">
              {CONTACT}
            </a>
            <a href={APP_URL} className="hover:text-ink">
              Log ind
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Role({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex size-11 items-center justify-center rounded-xl bg-accent-bg text-accent-ink">{icon}</span>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-muted">{text}</p>
    </div>
  );
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] border border-line bg-surface p-5">
      <h3 className="text-[17px] font-bold">{title}</h3>
      <p className="text-[15px] text-muted">{children}</p>
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ok text-[12px] font-bold text-white">✓</span>
      {children}
    </li>
  );
}

// En stiliseret telefon med lærerens dag, som i appen. Kun en tegning.
function PhoneMock() {
  const lessons = [
    { time: "08:00–09:30", what: "Amu C", status: "Godkendt", tone: "text-ok" },
    { time: "10:00–11:30", what: "C privat", status: "Afventer", tone: "text-muted" },
    { time: "12:00–13:30", what: "Amu-teori", status: "Planlagt", tone: "text-accent-ink" },
  ];
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[36px] border border-line bg-bg p-5 shadow-[0_20px_50px_-30px_rgba(38,36,34,0.35)]" aria-hidden="true">
      <p className="text-[13px] text-muted">Hej Lars</p>
      <p className="mb-4 text-2xl font-bold">Torsdag 12. november</p>
      <div className="flex flex-col gap-2.5">
        {lessons.map((l) => (
          <div key={l.time} className="flex items-center justify-between rounded-[16px] border border-line bg-surface px-4 py-3">
            <span>
              <b className="block">{l.time}</b>
              <span className="text-[13px] text-muted">{l.what}</span>
            </span>
            <span className={`text-sm font-semibold ${l.tone}`}>{l.status}</span>
          </div>
        ))}
        <span className="mt-1 flex h-11 items-center justify-center rounded-[14px] bg-accent text-[15px] font-bold text-ink">Udført</span>
      </div>
    </div>
  );
}
