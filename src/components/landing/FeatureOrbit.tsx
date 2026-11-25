import { useRef, useState } from "react";
import { ArrowLeftRight, FileBarChart, FileText, Mic, Pause, Play, ScanLine } from "lucide-react";
import {
  gsap,
  EASE_OUT,
  MOTION_OK,
  MOTION_REDUCED,
  REDUCED_FADE,
  isLowPowerDevice,
  useGSAP,
} from "@/lib/motion";
import { useI18n } from "@/i18n/I18nProvider";

// One satellite per real feature. Each links to its explanation below, so the orbit is
// also a menu and nothing it says depends on the animation running.
const SATELLITES = [
  { id: "feature-scanner", label: "landing.scannerTitle", icon: ScanLine, angle: -90 },
  { id: "feature-prescription", label: "landing.prescriptionTitle", icon: FileText, angle: -18 },
  { id: "feature-interactions", label: "nav.interactions", icon: ArrowLeftRight, angle: 54 },
  { id: "feature-report", label: "landing.reportTitle", icon: FileBarChart, angle: 126 },
  { id: "feature-diary", label: "landing.diaryTitle", icon: Mic, angle: 198 },
] as const;

const REVOLUTION_SECONDS = 150; // slow enough to read and to click

/** The phone at the centre of the orbit: an illustration of the result layout, with no medical content. */
function PhoneMock() {
  const { t } = useI18n();
  const rows = [
    { urdu: "خوراک", width: "w-3/4" },
    { urdu: "وقت", width: "w-1/2" },
    { urdu: "احتیاط", width: "w-5/6" },
  ];
  return (
    <div
      role="img"
      aria-label={t("landing.phoneAlt")}
      className="orbit-phone relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-[1.75rem] border-[5px] border-ink bg-card p-2.5"
    >
      <div className="relative h-[30%] shrink-0 overflow-hidden rounded-2xl bg-accent">
        <div className="absolute inset-x-[14%] inset-y-[16%] flex flex-col justify-center gap-1.5 rounded-lg bg-card p-2 shadow-sm">
          <span className="h-2 w-2/3 rounded-full bg-primary" />
          <span className="h-1.5 w-full rounded-full bg-lavender" />
          <span className="h-1.5 w-4/5 rounded-full bg-lavender" />
        </div>
        <span className="orbit-scan absolute inset-x-0 top-0 h-0.5 bg-coral" />
      </div>
      {rows.map((row) => (
        <div key={row.urdu} className="rounded-xl bg-secondary px-2.5 py-1.5">
          <p
            dir="rtl"
            lang="ur"
            className="urdu !text-[0.6875rem] !leading-[1.7] font-semibold text-accent-foreground"
          >
            {row.urdu}
          </p>
          <span
            className={`orbit-bar mt-0.5 block h-1.5 origin-left rounded-full bg-primary rtl:origin-right ${row.width}`}
          />
        </div>
      ))}
      <span className="mt-auto block h-6 shrink-0 rounded-full bg-primary" />
    </div>
  );
}

export function FeatureOrbit() {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const spin = useRef<gsap.core.Timeline | null>(null);
  const intro = useRef<gsap.core.Timeline | null>(null);
  const pausedByUser = useRef(false);
  // Pointer or keyboard focus inside the orbit: stays still until it leaves.
  const held = useRef(false);
  const [paused, setPaused] = useState(false);
  const [canSpin, setCanSpin] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Assembles once as it scrolls into view.
      mm.add(MOTION_OK, () => {
        // Opacity only, never visibility: the satellites must stay in the Tab order even
        // before the reader has scrolled to them.
        intro.current = gsap
          .timeline({
            defaults: { ease: EASE_OUT },
            scrollTrigger: { trigger: root.current, start: "top 75%", once: true },
          })
          .from(".orbit-disc", { opacity: 0, scale: 0.86, duration: 0.9 })
          .from(".orbit-phone-wrap", { opacity: 0, y: 36, duration: 0.8 }, "-=0.65")
          .from(".orbit-track", { opacity: 0, scale: 0.94, duration: 0.7 }, "-=0.55")
          .from(
            ".orbit-node",
            { opacity: 0, scale: 0.7, duration: 0.45, stagger: 0.07, ease: "back.out(1.6)" },
            "-=0.5",
          )
          .fromTo(
            ".orbit-scan",
            { top: "0%" },
            { top: "100%", duration: 1.1, ease: "power1.inOut" },
            "-=0.35",
          )
          .from(".orbit-bar", { scaleX: 0, duration: 0.5, stagger: 0.14 }, "<0.25");
      });

      mm.add(MOTION_REDUCED, () => {
        gsap.from(root.current, { opacity: 0, ...REDUCED_FADE });
      });

      // The orbit only turns when there is room for it; phones get a static list instead.
      mm.add(`${MOTION_OK} and (min-width: 640px)`, () => {
        if (isLowPowerDevice()) return;
        const tl = gsap.timeline({
          repeat: -1,
          defaults: { ease: "none", duration: REVOLUTION_SECONDS },
        });
        tl.to(".orbit-ring", { rotation: 360 }, 0).to(".orbit-node", { rotation: -360 }, 0);
        spin.current = tl;
        setCanSpin(true);
        // Initialise now (reads each node's transform once at load), then wait until visible.
        tl.progress(0.0001).progress(0).pause();

        // Turns only while visible, and never while the person has paused it.
        const visibility = new IntersectionObserver(([entry]) => {
          if (pausedByUser.current || held.current) return;
          if (entry.isIntersecting) tl.play();
          else tl.pause();
        });
        if (root.current) visibility.observe(root.current);

        return () => {
          visibility.disconnect();
          spin.current = null;
          setCanSpin(false);
        };
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  function togglePause() {
    pausedByUser.current = !pausedByUser.current;
    setPaused(pausedByUser.current);
    if (pausedByUser.current) spin.current?.pause();
    else spin.current?.play();
  }

  // Holding still under the pointer or keyboard focus keeps moving targets easy to hit.
  const hold = () => {
    held.current = true;
    spin.current?.pause();
  };
  // Keyboard focus arriving before the entrance has played: show everything at once.
  const onFocusIn = () => {
    intro.current?.progress(1);
    hold();
  };
  const release = () => {
    held.current = false;
    if (!pausedByUser.current) spin.current?.play();
  };

  return (
    <div
      ref={root}
      className="orbit-stage relative mx-auto w-full max-w-[36rem] sm:aspect-square"
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocusCapture={onFocusIn}
      onBlurCapture={release}
    >
      <div className="relative mx-auto aspect-square w-[min(19rem,88%)] sm:absolute sm:inset-[20%] sm:w-auto">
        <div className="orbit-disc absolute inset-0 rounded-full bg-accent" />
        <div className="orbit-phone-wrap absolute inset-y-[3%] inset-x-[27%]">
          <PhoneMock />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="orbit-track absolute inset-[13%] hidden rounded-full border-2 border-dashed border-lavender sm:block"
      />
      <ul
        aria-label={t("landing.heroFeaturesLabel")}
        className="orbit-ring mt-6 grid grid-cols-2 gap-2 sm:absolute sm:inset-[13%] sm:mt-0 sm:block"
      >
        {SATELLITES.map(({ id, label, icon: Icon, angle }) => (
          <li
            key={id}
            className="sm:absolute sm:start-(--x) sm:top-(--y) sm:-translate-x-1/2 sm:-translate-y-1/2 rtl:sm:translate-x-1/2"
            style={
              {
                "--x": `${50 + 50 * Math.cos((angle * Math.PI) / 180)}%`,
                "--y": `${50 + 50 * Math.sin((angle * Math.PI) / 180)}%`,
              } as React.CSSProperties
            }
          >
            <a
              href={`#${id}`}
              className="orbit-node press flex min-h-11 items-center gap-2 rounded-full border border-border bg-card py-1.5 pe-3.5 ps-1.5 text-sm font-semibold shadow-[0_8px_20px_-12px_rgb(75_46_131/0.5)] hover:bg-accent sm:w-max sm:max-w-40"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">{t(label)}</span>
            </a>
          </li>
        ))}
      </ul>
      {canSpin && (
        <button
          type="button"
          onClick={togglePause}
          aria-pressed={paused}
          aria-label={paused ? t("landing.orbitPlay") : t("landing.orbitPause")}
          className="press absolute bottom-0 end-0 grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-primary hover:bg-accent"
        >
          {paused ? (
            <Play className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Pause className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
