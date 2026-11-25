import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import {
  gsap,
  EASE_OUT,
  MOTION_OK,
  MOTION_REDUCED,
  REDUCED_FADE,
  ScrollTrigger,
  refreshOnAssetsReady,
  useGSAP,
} from "@/lib/motion";
import { LandingNav } from "@/components/landing/LandingNav";
import { StethoscopeHero } from "@/components/landing/StethoscopeHero";
import {
  CalendarShowcase,
  IntroSection,
  FaqSection,
  FeaturesSection,
  FinalCta,
  HowItWorks,
  LandingFooter,
  Showcase,
  WhySection,
} from "@/components/landing/sections";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "MediSnap — Medicine Labels Explained in Urdu" },
      {
        name: "description",
        content:
          "Scan any English medicine label or doctor prescription and instantly understand dosage, timing and warnings in clear Urdu.",
      },
      { property: "og:title", content: "Home — MediSnap" },
      {
        property: "og:description",
        content:
          "Scan English medicine labels and prescriptions and understand them in clear Urdu, with symptom tracking and doctor reports.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const { language } = useI18n();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        // The journey line and closing ring follow the scrollbar, so they stay under the reader's control.
        gsap.from(".how-line", {
          scaleX: 0,
          ease: "none",
          scrollTrigger: { trigger: ".how-steps", start: "top 75%", end: "bottom 60%", scrub: 0.6 },
        });
        gsap.from(".final-ring", {
          y: 90,
          ease: "none",
          scrollTrigger: {
            trigger: ".final-cta",
            start: "top bottom",
            end: "bottom bottom",
            scrub: 0.6,
          },
        });
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  // Block reveals are CSS transitions switched on by an IntersectionObserver: the browser
  // animates opacity and translate itself, so scrolling runs no per-frame JavaScript for
  // them (measured: GSAP-driven reveals cost several times more under CPU throttling).
  useEffect(() => {
    const scope = root.current;
    if (!scope || !window.matchMedia(MOTION_OK).matches) return;
    const items = Array.from(scope.querySelectorAll<HTMLElement>("[data-reveal]"));
    items.forEach((el) => el.classList.add("reveal-pending"));
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        entries
          .filter((e) => e.isIntersecting)
          .forEach((entry, i) => {
            const el = entry.target as HTMLElement;
            io.unobserve(el);
            el.style.transitionDelay = `${i * 70}ms`;
            el.classList.add("is-revealed");
            // Clear the stagger afterwards so hover feedback isn't delayed.
            timers.push(window.setTimeout(() => (el.style.transitionDelay = ""), i * 70 + 700));
          });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      items.forEach((el) => {
        el.classList.remove("reveal-pending", "is-revealed");
        el.style.transitionDelay = "";
      });
    };
  }, []);

  useEffect(() => refreshOnAssetsReady(), []);

  // Translated text changes section heights, which moves every trigger.
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [language]);

  return (
    <div ref={root} className="min-h-screen overflow-x-clip">
      <LandingNav />
      <main id="main">
        <StethoscopeHero />
        <IntroSection />
        <FeaturesSection />
        <HowItWorks />
        <Showcase />
        <CalendarShowcase />
        <WhySection />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
