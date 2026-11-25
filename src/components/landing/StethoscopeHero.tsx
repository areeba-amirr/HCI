import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, Languages } from "lucide-react";
import {
  gsap,
  EASE_OUT,
  MOTION_OK,
  MOTION_REDUCED,
  REDUCED_FADE,
  isLowPowerDevice,
  useGSAP,
} from "@/lib/motion";
import { buttonVariants } from "@/components/ui/button";
import { HeroHeadline, SplitReveal } from "@/components/motion/SplitReveal";
import { useI18n } from "@/i18n/I18nProvider";

const SIZES = "(min-width: 1024px) 46vw, 92vw";
const SRCSET = [640, 960, 1280, 1920].map((w) => `/images/stethoscope-${w}.webp ${w}w`).join(", ");

/** A heartbeat trace for the diary chip, drawn once on entrance. */
function Pulse() {
  return (
    <svg viewBox="0 0 120 32" className="h-8 w-28" aria-hidden="true">
      <path
        className="hero-pulse"
        d="M2 18 H34 L42 6 L52 28 L60 12 L66 18 H118"
        fill="none"
        stroke="var(--coral-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StethoscopeHero() {
  const { t } = useI18n();
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reveal = () => document.documentElement.classList.remove("motion-ok");
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        gsap.set(".hero-curtain", { yPercent: 0 });
        gsap.set(".hero-chip, .hero-cta, .hero-trust li, .hero-shape", { autoAlpha: 0 });
        reveal();
        const pulse = root.current?.querySelector<SVGPathElement>(".hero-pulse");
        const length = pulse?.getTotalLength() ?? 0;
        const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });
        tl.fromTo(
          ".hero-shape",
          { autoAlpha: 0, scale: 0.9 },
          { autoAlpha: 1, scale: 1, duration: 1, stagger: 0.1 },
          0,
        )
          // The photo is uncovered by a lavender curtain lifting away while the image settles.
          .to(".hero-curtain", { yPercent: -101, duration: 1.1, ease: "power4.inOut" }, 0.15)
          .from(".hero-photo", { scale: 1.12, duration: 1.6, ease: "power2.out" }, 0.15)
          .fromTo(
            ".hero-cta",
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08 },
            1.3,
          )
          .fromTo(
            ".hero-chip",
            { autoAlpha: 0, y: 20, scale: 0.94 },
            { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.12 },
            1.1,
          )
          .fromTo(
            ".hero-trust li",
            { autoAlpha: 0, x: -8 },
            { autoAlpha: 1, x: 0, duration: 0.4, stagger: 0.07 },
            1.6,
          );
        if (pulse)
          tl.fromTo(
            pulse,
            { strokeDasharray: length, strokeDashoffset: length },
            { strokeDashoffset: 0, duration: 1.1, ease: "power1.inOut" },
            1.5,
          );

        // Depth on scroll: layers drift at different speeds, under the reader's control.
      });

      // Depth on scroll, desktop only: layers drift at different speeds under the reader's
      // control. fromTo with explicit values so nothing is measured mid-scroll, and each
      // layer is promoted once (will-change) instead of being repainted every frame.
      mm.add(`${MOTION_OK} and (min-width: 1024px)`, () => {
        if (isLowPowerDevice()) return;
        const st = { trigger: root.current, start: "top top", end: "bottom top", scrub: 0.5 };
        const layers: [string, number][] = [
          [".hero-photo-frame", -40],
          [".hero-chip-a", -90],
          [".hero-chip-b", -60],
          [".hero-chip-c", -120],
        ];
        gsap.set(layers.map(([s]) => s).join(","), { willChange: "transform" });
        for (const [selector, y] of layers) {
          gsap.fromTo(
            selector,
            { y: 0 },
            { y, ease: "none", immediateRender: true, scrollTrigger: st },
          );
        }
      });

      mm.add(MOTION_REDUCED, () => {
        reveal();
        gsap.set(".hero-curtain", { yPercent: -101 });
        gsap.from("[data-hero]", { autoAlpha: 0, ...REDUCED_FADE });
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="top" className="hero-wash relative overflow-x-clip">
      <div className="mx-auto grid max-w-[88rem] items-center gap-12 px-5 pb-20 pt-10 md:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:pb-28 lg:pt-14">
        <div className="relative z-10">
          <HeroHeadline
            lead={t("landing.heroLead")}
            accent={t("landing.heroAccent")}
            className="display text-[2.9rem] leading-[1.02] sm:text-7xl xl:text-[5.5rem]"
          />
          <SplitReveal
            effect="type"
            hero
            onScroll={false}
            delay={1}
            text={t("landing.intro")}
            className="mt-7 max-w-xl text-lg text-muted-foreground md:text-xl"
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className={`hero-cta ${buttonVariants({ size: "lg" })}`} data-hero>
              {t("landing.getStarted")}
            </Link>
            <a
              href="#features"
              className={`hero-cta ${buttonVariants({ size: "lg", variant: "outline" })}`}
              data-hero
            >
              {t("landing.exploreFeatures")}
            </a>
          </div>
          <ul className="hero-trust mt-8 grid gap-2 text-[0.9375rem] sm:grid-cols-2">
            {(["landing.heroTrust1", "landing.heroTrust2"] as const).map((k) => (
              <li key={k} data-hero className="flex items-start gap-2">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                {t(k)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">{t("landing.heroNote")}</p>
        </div>

        <div className="relative mx-auto w-full max-w-[40rem] lg:me-0">
          {/* Layered shapes give the photograph depth against the page. */}
          <div
            aria-hidden="true"
            data-hero
            className="hero-shape absolute -inset-x-4 -bottom-6 top-10 -z-0 rotate-[-4deg] rounded-[3rem] bg-accent sm:-inset-x-8"
          />
          <div
            aria-hidden="true"
            data-hero
            className="hero-shape absolute -end-3 -top-5 h-24 w-24 rounded-full bg-coral/80 sm:-end-6 sm:h-28 sm:w-28"
          />

          <figure className="hero-photo-frame relative z-10 overflow-hidden rounded-[2.5rem] bg-ink shadow-[0_40px_80px_-40px_rgb(42_26_74/0.65)] ring-1 ring-black/5">
            <img
              className="hero-photo aspect-[5/4] h-auto w-full object-cover"
              src="/images/stethoscope-960.jpg"
              srcSet={SRCSET}
              sizes={SIZES}
              width={1280}
              height={1024}
              alt={t("landing.photoAlt")}
              fetchPriority="high"
              decoding="async"
            />
            <span aria-hidden="true" className="hero-curtain absolute inset-0 bg-lavender" />
            <figcaption className="sr-only">{t("landing.photoCredit")}</figcaption>
          </figure>

          {/* Chips name real features; they carry no medical content of their own. */}
          <div
            className="hero-chip hero-chip-a absolute -start-3 top-[12%] z-20 flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-[0_16px_36px_-18px_rgb(42_26_74/0.5)] sm:-start-10"
            data-hero
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary">
              <Languages className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{t("landing.heroChipLanguages")}</span>
              <span lang="ur" className="urdu block !text-sm !leading-[1.6] text-muted-foreground">
                اردو · English
              </span>
            </span>
          </div>
          <div
            className="hero-chip hero-chip-b absolute -end-2 bottom-[18%] z-20 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-[0_16px_36px_-18px_rgb(42_26_74/0.5)] sm:-end-8"
            data-hero
          >
            <span className="block text-sm font-semibold">{t("landing.heroChipDiary")}</span>
            <Pulse />
          </div>
          <div
            className="hero-chip hero-chip-c absolute -bottom-6 start-[10%] z-20 hidden items-center gap-2.5 rounded-2xl bg-primary px-3.5 py-2.5 text-primary-foreground shadow-[0_16px_36px_-18px_rgb(42_26_74/0.7)] sm:flex"
            data-hero
          >
            <CalendarDays className="h-5 w-5 text-coral" aria-hidden="true" />
            <span className="text-sm font-semibold">{t("landing.heroChipCalendar")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
