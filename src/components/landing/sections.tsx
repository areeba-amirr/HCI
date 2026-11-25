import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  Camera,
  Clock,
  FileBarChart,
  FileText,
  Globe2,
  Lock,
  Mic,
  NotebookText,
  Pill,
  Save,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { gsap, EASE_OUT, MOTION_OK, MOTION_REDUCED, REDUCED_FADE, useGSAP } from "@/lib/motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/brand/Logo";
import { MedicalField } from "@/components/app/primitives";
import { HealthCalendar } from "@/components/app/HealthCalendar";
import { SplitReveal } from "@/components/motion/SplitReveal";
import { FeatureOrbit } from "./FeatureOrbit";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";

/** Abbreviations the prescription reader is actually instructed to decode. */
const ABBREVIATIONS = [
  { code: "OD", en: "landing.abbrOd", ur: "ایک بار روزانہ" },
  { code: "BD", en: "landing.abbrBd", ur: "دو بار روزانہ" },
  { code: "TDS", en: "landing.abbrTds", ur: "تین بار روزانہ" },
  { code: "PC", en: "landing.abbrPc", ur: "کھانے کے بعد" },
] as const;

export function FeaturesSection() {
  const { t } = useI18n();
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="mx-auto max-w-[88rem] px-5 py-16 md:px-8 md:py-24"
    >
      <div className="max-w-3xl">
        <SplitReveal
          as="h2"
          id="features-title"
          effect="lines"
          text={t("landing.featuresTitle")}
          className="display text-4xl md:text-6xl"
        />
        <p data-reveal className="mt-4 text-lg text-muted-foreground">
          {t("landing.featuresIntro")}
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-6">
        <article
          id="feature-scanner"
          data-reveal
          className="feature-card lift relative isolate flex scroll-mt-24 flex-col overflow-hidden rounded-[2rem] bg-[linear-gradient(150deg,#E7E0FA_0%,#F1ECFA_55%,#FBF3EE_100%)] p-6 md:col-span-3 md:p-8"
        >
          <span
            aria-hidden="true"
            className="absolute -end-16 -top-16 -z-10 h-56 w-56 rounded-full border-[1.75rem] border-white/60"
          />
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ScanLine className="h-7 w-7" aria-hidden="true" />
          </span>
          <h3 className="display mt-5 text-3xl">{t("landing.scannerTitle")}</h3>
          <p className="mt-2 max-w-prose">{t("landing.scannerDesc")}</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {(["scan.dosage", "scan.frequency", "scan.instructions", "scan.warnings"] as const).map(
              (k) => (
                <p
                  key={k}
                  className="rounded-xl bg-card/90 px-3 py-2 text-sm font-semibold shadow-sm"
                >
                  {t(k)}
                </p>
              ),
            )}
          </div>
        </article>

        <article
          id="feature-prescription"
          data-reveal
          className="feature-card lift on-dark relative isolate flex scroll-mt-24 flex-col overflow-hidden rounded-[2rem] bg-[linear-gradient(160deg,#5A3A96_0%,#4B2E83_45%,#36215F_100%)] p-6 text-primary-foreground md:col-span-3 md:p-8"
        >
          <span
            aria-hidden="true"
            className="absolute -bottom-24 -end-10 -z-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgb(244_132_95/0.35),transparent_65%)]"
          />
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-coral text-ink">
            <FileText className="h-7 w-7" aria-hidden="true" />
          </span>
          <h3 className="display mt-5 text-3xl">{t("landing.prescriptionTitle")}</h3>
          <p className="mt-2 max-w-prose text-[#E7E0FA]">{t("landing.prescriptionDesc")}</p>
          <dl className="mt-6 divide-y divide-[#6E52A6]">
            {ABBREVIATIONS.map(({ code, en, ur }) => (
              <div
                key={code}
                className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-2 py-2"
              >
                <dt translate="no" dir="ltr" className="text-start font-bold">
                  {code}
                </dt>
                <dd>{t(en)}</dd>
                <dd lang="ur" className="urdu !text-[0.9375rem]">
                  {ur}
                </dd>
              </div>
            ))}
          </dl>
        </article>

        {(
          [
            {
              id: "feature-diary",
              icon: Mic,
              title: "landing.diaryTitle",
              desc: "landing.diaryDesc",
            },
            {
              id: "feature-interactions",
              icon: ArrowLeftRight,
              title: "nav.interactions",
              desc: "landing.interactionsDesc",
            },
            {
              id: "feature-report",
              icon: FileBarChart,
              title: "landing.reportTitle",
              desc: "landing.reportDesc",
            },
          ] as const
        ).map(({ id, icon: Icon, title, desc }) => (
          <article
            key={id}
            id={id}
            data-reveal
            className="feature-card lift flex scroll-mt-24 flex-col rounded-[2rem] border border-border bg-card p-6 shadow-[0_18px_40px_-34px_rgb(75_46_131/0.6)] md:col-span-2 md:p-8"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-coral-ink">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="display mt-4 text-2xl">{t(title)}</h3>
            <p className="mt-2 text-muted-foreground">{t(desc)}</p>
            <MiniVisual kind={id} />
          </article>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Camera, title: "landing.step1Title", body: "landing.step1Body" },
  { icon: Sparkles, title: "landing.step2Title", body: "landing.step2Body" },
  { icon: Save, title: "landing.step3Title", body: "landing.step3Body" },
] as const;

export function HowItWorks() {
  const { t } = useI18n();
  return (
    <section id="how" aria-labelledby="how-title" className="bg-secondary">
      <div className="mx-auto max-w-[88rem] px-5 py-16 md:px-8 md:py-24">
        <SplitReveal
          as="h2"
          id="how-title"
          effect="lines"
          text={t("landing.howTitle")}
          className="display max-w-3xl text-4xl md:text-6xl"
        />
        <div className="how-steps relative mt-12">
          {/* The line fills as the reader moves through the steps, showing it's one journey. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-[16%] top-7 hidden h-0.5 bg-lavender md:block"
          >
            <div className="how-line h-full origin-left bg-primary rtl:origin-right" />
          </div>
          <ol className="relative grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                data-reveal
                className="flex gap-4 md:flex-col md:items-center md:text-center"
              >
                <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_6px_var(--secondary),0_0_0_7px_var(--lavender)]">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="display text-2xl">
                    <span className="text-coral-ink">{i + 1}. </span>
                    {t(title)}
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{t(body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

const SHOWCASE_TABS = [
  { value: "scan", icon: ScanLine, label: "landing.scannerTitle", caption: "landing.showcaseScan" },
  {
    value: "prescription",
    icon: FileText,
    label: "landing.prescriptionTitle",
    caption: "landing.showcasePrescription",
  },
  { value: "diary", icon: Mic, label: "landing.diaryTitle", caption: "landing.showcaseDiary" },
  {
    value: "interaction",
    icon: ArrowLeftRight,
    label: "nav.interactions",
    caption: "landing.showcaseInteraction",
  },
] as const;

export function Showcase() {
  const { t } = useI18n();
  const [tab, setTab] = useState<string>("scan");
  const panel = useRef<HTMLDivElement>(null);

  // Motion answers the choice of tab and shows that the content changed.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".showcase-frame", {
          y: 12,
          opacity: 0,
          duration: 0.25,
          ease: EASE_OUT,
          clearProps: "all",
        });
      });
      mm.add(MOTION_REDUCED, () => {
        gsap.from(".showcase-frame", { opacity: 0, ...REDUCED_FADE, clearProps: "all" });
      });
      return () => mm.revert();
    },
    { scope: panel, dependencies: [tab], revertOnUpdate: true },
  );

  const current = SHOWCASE_TABS.find((x) => x.value === tab) ?? SHOWCASE_TABS[0];

  return (
    <section
      aria-labelledby="showcase-title"
      className="mx-auto max-w-[88rem] px-5 py-16 md:px-8 md:py-24"
    >
      <div className="max-w-3xl">
        <SplitReveal
          as="h2"
          id="showcase-title"
          effect="words"
          text={t("landing.showcaseTitle")}
          className="display text-4xl md:text-6xl"
        />
        <p data-reveal className="mt-4 text-lg text-muted-foreground">
          {t("landing.showcaseIntro")}
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList aria-label={t("landing.showcaseTitle")}>
          {SHOWCASE_TABS.map(({ value, icon: Icon, label }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div ref={panel} className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="display text-3xl">{t(current.label)}</p>
            <p className="mt-3 text-muted-foreground">{t(current.caption)}</p>
            <p className="mt-4 inline-flex rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
              {t("landing.sampleLabel")}
            </p>
          </div>
          {/* Screens reuse the app's own components; all values are obviously sample text. */}
          <div className="showcase-frame rounded-[2rem] bg-[linear-gradient(140deg,#E7E0FA,#F6EFE9)] p-3 shadow-[0_30px_60px_-45px_rgb(42_26_74/0.7)] sm:p-5">
            <TabsContent value="scan" className="mt-0">
              <SampleScan />
            </TabsContent>
            <TabsContent value="prescription" className="mt-0">
              <SamplePrescription />
            </TabsContent>
            <TabsContent value="diary" className="mt-0">
              <SampleDiary />
            </TabsContent>
            <TabsContent value="interaction" className="mt-0">
              <SampleInteraction />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </section>
  );
}

const SAMPLE = {
  name: "Sample Tablet 500 mg",
  nameUr: "نمونے کی گولی",
  dose: "1 tablet",
  doseUr: "1 گولی",
  when: "Twice a day",
  whenUr: "دن میں دو بار",
  how: "After food",
  howUr: "کھانے کے بعد",
  warn: "Sample warning text",
  warnUr: "نمونہ انتباہ",
};

function SampleScan() {
  const { t } = useI18n();
  return (
    <div className="panel space-y-3">
      <p className="display text-2xl text-primary">
        <bdi dir="ltr" translate="no">
          {SAMPLE.name}
        </bdi>
      </p>
      <p className="urdu text-lg">{SAMPLE.nameUr}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <MedicalField icon={Pill} label={t("scan.dosage")} en={SAMPLE.dose} ur={SAMPLE.doseUr} />
        <MedicalField
          icon={Clock}
          label={t("scan.frequency")}
          en={SAMPLE.when}
          ur={SAMPLE.whenUr}
        />
        <MedicalField
          icon={NotebookText}
          label={t("scan.instructions")}
          en={SAMPLE.how}
          ur={SAMPLE.howUr}
        />
        <MedicalField
          icon={AlertTriangle}
          label={t("scan.warnings")}
          en={SAMPLE.warn}
          ur={SAMPLE.warnUr}
          emphasis
        />
      </div>
    </div>
  );
}

function SamplePrescription() {
  const { t } = useI18n();
  return (
    <div className="panel space-y-3">
      <p className="display text-2xl">{t("prescription.found", { count: 1 })}</p>
      <div className="rounded-2xl border border-border p-4">
        <p className="text-lg font-bold">
          <span className="text-primary">1. </span>
          <bdi dir="ltr" translate="no">
            {SAMPLE.name}
          </bdi>
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MedicalField icon={Clock} label={t("scan.frequency")} en="BD" ur={SAMPLE.whenUr} />
          <MedicalField icon={CalendarDays} label={t("scan.duration")} en="x7d" ur="7 دن" />
        </div>
      </div>
    </div>
  );
}

function SampleDiary() {
  const { t } = useI18n();
  return (
    <div className="panel grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-primary text-primary-foreground">
        <Mic className="h-8 w-8" aria-hidden="true" />
      </span>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { k: t("report.pain"), v: "4/10" },
          { k: t("dashboard.sleep"), v: "7h" },
          { k: t("landing.sampleMood"), v: t("diary.moodOkay") },
        ].map(({ k, v }) => (
          <div key={k} className="rounded-2xl bg-secondary p-3">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="font-semibold">
              <bdi>{v}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SampleInteraction() {
  const { t } = useI18n();
  return (
    <div className="panel space-y-3">
      <p className="text-muted-foreground">
        <bdi dir="ltr" translate="no">
          Sample A + Sample B
        </bdi>
      </p>
      <div className="rounded-2xl border border-warning/50 bg-warning/8 p-4">
        <p className="flex items-center gap-2 font-semibold text-warning">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {t("history.cautionSeverity", { severity: t("history.severityModerate") })}
        </p>
        <p className="mt-2 text-[0.9375rem]">{t("interactions.limits")}</p>
      </div>
    </div>
  );
}

const BENEFITS = [
  { icon: Globe2, title: "landing.why1Title", body: "landing.why1Body" },
  { icon: FileText, title: "landing.why2Title", body: "landing.why2Body" },
  { icon: FileBarChart, title: "landing.why3Title", body: "landing.why3Body" },
  { icon: Lock, title: "landing.why4Title", body: "landing.why4Body" },
] as const;

export function WhySection() {
  const { t } = useI18n();
  return (
    <section
      id="about"
      aria-labelledby="why-title"
      className="on-dark bg-primary text-primary-foreground"
    >
      <div className="mx-auto grid max-w-[88rem] gap-10 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[2fr_3fr]">
        <div>
          <SplitReveal
            as="h2"
            id="why-title"
            effect="lines"
            text={t("landing.whyTitle")}
            className="display text-4xl md:text-6xl"
          />
          <p data-reveal className="mt-4 max-w-md text-lg text-[#E7E0FA]">
            {t("landing.whyIntro")}
          </p>
        </div>
        <ul className="divide-y divide-[#6E52A6]">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <li key={title} data-reveal className="flex gap-4 py-6 first:pt-0">
              <Icon className="mt-1 h-6 w-6 shrink-0 text-coral" aria-hidden="true" />
              <div>
                <h3 className="display text-2xl">{t(title)}</h3>
                <p className="mt-1 max-w-prose text-[#E7E0FA]">{t(body)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FAQ: { q: MessageKey; a: MessageKey }[] = [
  { q: "landing.faq1Q", a: "landing.faq1A" },
  { q: "landing.faq2Q", a: "landing.faq2A" },
  { q: "landing.faq3Q", a: "landing.faq3A" },
  { q: "landing.faq4Q", a: "landing.faq4A" },
  { q: "landing.faq5Q", a: "landing.faq5A" },
  { q: "landing.faq6Q", a: "landing.faq6A" },
];

export function FaqSection() {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="faq-title"
      className="mx-auto grid max-w-[88rem] gap-8 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[2fr_3fr]"
    >
      <SplitReveal
        as="h2"
        id="faq-title"
        effect="lines"
        text={t("landing.faqTitle")}
        className="display text-4xl md:text-6xl"
      />
      <Accordion data-reveal type="single" collapsible className="border-t border-border">
        {FAQ.map(({ q, a }) => (
          <AccordionItem key={q} value={q}>
            <AccordionTrigger>{t(q)}</AccordionTrigger>
            <AccordionContent>{t(a)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

export function FinalCta() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="cta-title" className="px-5 pb-16 md:px-8 md:pb-24">
      <div className="final-cta on-dark relative isolate mx-auto max-w-[88rem] overflow-hidden rounded-[2.5rem] bg-[linear-gradient(155deg,#5A3A96_0%,#4B2E83_50%,#2F1B55_100%)] px-6 py-16 text-center text-primary-foreground md:py-24">
        <div
          aria-hidden="true"
          className="final-ring absolute -bottom-48 start-1/2 -z-10 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full border-[3rem] border-[#5D3F97] rtl:translate-x-1/2"
        />
        <SplitReveal
          as="h2"
          id="cta-title"
          effect="words"
          text={t("landing.ctaTitle")}
          className="display mx-auto max-w-3xl text-4xl md:text-6xl"
        />
        <p className="mx-auto mt-4 max-w-xl text-lg text-[#E7E0FA]">{t("landing.ctaBody")}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/signup"
            className="press inline-flex min-h-13 items-center justify-center rounded-full bg-coral px-7 py-3 font-semibold text-ink hover:bg-[#F79A7C]"
          >
            {t("landing.getStarted")}
          </Link>
          <Link
            to="/login"
            className="press inline-flex min-h-13 items-center justify-center rounded-full border border-[#E7E0FA] px-7 py-3 font-semibold hover:bg-[#5D3F97]"
          >
            {t("landing.haveAccount")}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-[88rem] gap-8 px-5 py-10 md:grid-cols-[2fr_1fr_1fr] md:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-md text-[0.9375rem] text-muted-foreground">
            {t("landing.footer")}
          </p>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            {t("landing.photoCreditLead")}{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://commons.wikimedia.org/w/index.php?curid=94015103"
              rel="noreferrer license"
              target="_blank"
              translate="no"
            >
              “Health - Stethoscope” by formulatehealth
            </a>
            ,{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://creativecommons.org/licenses/by/2.0/"
              rel="noreferrer license"
              target="_blank"
              translate="no"
            >
              CC BY 2.0
            </a>
            . {t("landing.photoCreditEdits")}
          </p>
        </div>
        <nav aria-label={t("landing.footerExplore")}>
          <p className="font-semibold">{t("landing.footerExplore")}</p>
          <ul className="mt-1">
            <li>
              <a href="#features" className="inline-flex min-h-11 items-center hover:underline">
                {t("landing.navFeatures")}
              </a>
            </li>
            <li>
              <a href="#how" className="inline-flex min-h-11 items-center hover:underline">
                {t("landing.navHow")}
              </a>
            </li>
            <li>
              <a href="#about" className="inline-flex min-h-11 items-center hover:underline">
                {t("landing.navAbout")}
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label={t("landing.footerAccount")}>
          <p className="font-semibold">{t("landing.footerAccount")}</p>
          <ul className="mt-1">
            <li>
              <Link to="/login" className="inline-flex min-h-11 items-center hover:underline">
                {t("landing.login")}
              </Link>
            </li>
            <li>
              <Link to="/signup" className="inline-flex min-h-11 items-center hover:underline">
                {t("landing.getStarted")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}

/** Small illustrations that hint at each tool's interface. Decorative, so hidden from AT. */
function MiniVisual({ kind }: { kind: string }) {
  if (kind === "feature-diary") {
    return (
      <svg aria-hidden="true" viewBox="0 0 200 48" className="mt-6 h-12 w-full">
        <path
          d="M2 30 H52 L62 12 L76 40 L88 20 L96 30 H198"
          fill="none"
          stroke="var(--coral-ink)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "feature-interactions") {
    return (
      <div aria-hidden="true" className="mt-6 flex items-center gap-2">
        <span className="h-9 flex-1 rounded-full bg-accent" />
        <ArrowLeftRight className="h-5 w-5 text-primary" />
        <span className="h-9 flex-1 rounded-full bg-[#F6E2B3]" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="mt-6 flex h-12 items-end gap-1.5">
      {[40, 70, 55, 85, 45, 65, 30, 75].map((h, i) => (
        <span
          key={i}
          className={`flex-1 rounded-t-md ${i % 3 === 0 ? "bg-coral" : "bg-lavender"}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function IntroSection() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="intro-title" className="relative overflow-x-clip bg-card">
      <div className="mx-auto grid max-w-[88rem] items-center gap-10 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <h2 id="intro-title" className="sr-only">
            {t("landing.introTitle")}
          </h2>
          {/* The statement fills in as the reader moves through it. */}
          <SplitReveal
            effect="scrub"
            text={t("landing.introStatement")}
            className="display text-3xl leading-[1.18] md:text-[2.9rem]"
          />
          <p data-reveal className="mt-8 max-w-lg text-muted-foreground">
            {t("landing.orbitCaption")}
          </p>
        </div>
        <FeatureOrbit />
      </div>
    </section>
  );
}

// A month of made-up entries, clearly labelled, so visitors can try the real calendar.
function sampleMonth() {
  const now = new Date();
  const pains = [3, 5, 2, 7, 4, 2, 6, 3, 8, 4, 2, 5, 3];
  const days = [2, 3, 5, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21];
  const symptoms = days
    .filter((d) => d <= Math.max(now.getDate(), 21))
    .map((d, i) => ({
      id: `sample-${d}`,
      created_at: new Date(now.getFullYear(), now.getMonth(), d, 9).toISOString(),
      pain_level: pains[i],
      sleep_hours: [7, 6, 8, 5, 7, 7.5, 6][i % 7],
      mood: pains[i] <= 3 ? "happy" : pains[i] <= 6 ? "okay" : "sad",
      notes: "Sample note",
    }));
  const scans = [5, 14].map((d) => ({
    id: `scan-${d}`,
    created_at: new Date(now.getFullYear(), now.getMonth(), d, 10).toISOString(),
    medicine_name: "Sample Tablet 500 mg",
  }));
  return { symptoms, scans };
}

export function CalendarShowcase() {
  const { t } = useI18n();
  const [data] = useState(sampleMonth);
  return (
    <section
      id="calendar"
      aria-labelledby="calendar-title"
      className="bg-[linear-gradient(180deg,var(--background),#F1ECFA)]"
    >
      <div className="mx-auto grid max-w-[88rem] gap-10 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <SplitReveal
            as="h2"
            id="calendar-title"
            effect="lines"
            text={t("landing.calendarTitle")}
            className="display text-4xl md:text-6xl"
          />
          <p data-reveal className="mt-4 text-lg text-muted-foreground">
            {t("landing.calendarBody")}
          </p>
          <ul className="mt-6 space-y-3">
            {(
              [
                "landing.calendarPoint1",
                "landing.calendarPoint2",
                "landing.calendarPoint3",
              ] as const
            ).map((k) => (
              <li key={k} data-reveal className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                {t(k)}
              </li>
            ))}
          </ul>
          <p
            data-reveal
            className="mt-6 inline-flex rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground"
          >
            {t("landing.sampleData")}
          </p>
        </div>
        <div data-reveal className="panel shadow-[0_30px_70px_-50px_rgb(42_26_74/0.8)]">
          <HealthCalendar symptoms={data.symptoms} scans={data.scans} sample />
        </div>
      </div>
    </section>
  );
}
