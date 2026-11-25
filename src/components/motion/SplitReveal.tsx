import { useRef, type ElementType } from "react";
import {
  gsap,
  EASE_OUT,
  MOTION_OK,
  MOTION_REDUCED,
  REDUCED_FADE,
  SplitText,
  canSplitLetters,
  isLowPowerDevice,
  useGSAP,
} from "@/lib/motion";
import { useI18n } from "@/i18n/I18nProvider";

type Effect = "lines" | "words" | "type" | "scrub";

/**
 * Animated text that stays readable to everyone: assistive technology reads a plain copy
 * of the sentence, and the split copy that moves is hidden from it. The element is keyed
 * by its text so React never has to update nodes that SplitText has replaced.
 *
 * - lines: each line slides up from behind a mask as the heading scrolls into view
 * - words: words rise one after another
 * - type:  words pop in quickly in reading order, like text being written, then a caret fades
 * - scrub: words brighten from muted to full ink as the reader scrolls through them
 */
export function SplitReveal({
  as: Tag = "p",
  text,
  effect,
  className,
  id,
  delay = 0,
  onScroll = true,
  hero = false,
}: {
  /** Part of the landing hero: hidden before paint by MOTION_BOOT_SCRIPT, like the rest of it. */
  hero?: boolean;
  as?: ElementType;
  text: string;
  effect: Effect;
  className?: string;
  id?: string;
  delay?: number;
  /** false runs the effect on mount instead of when scrolled into view. */
  onScroll?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const { language } = useI18n();

  useGSAP(
    () => {
      const target = ref.current?.querySelector<HTMLElement>("[data-split]");
      if (!target) return;
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const trigger = onScroll
          ? { trigger: ref.current, start: "top 86%", once: true }
          : undefined;

        // Low-power devices: one short fade for the whole block, no splitting, no scrubbing.
        if (isLowPowerDevice()) {
          if (effect !== "scrub") {
            gsap.from(target, {
              opacity: 0,
              y: 12,
              duration: 0.5,
              ease: EASE_OUT,
              delay,
              scrollTrigger: trigger,
            });
          }
          return;
        }

        if (effect === "lines") {
          SplitText.create(target, {
            type: "lines",
            mask: "lines",
            aria: "none",
            autoSplit: true,
            onSplit: (self) =>
              gsap.from(self.lines, {
                yPercent: 105,
                duration: 0.85,
                stagger: 0.09,
                ease: "power4.out",
                delay,
                scrollTrigger: trigger,
              }),
          });
        } else if (effect === "words") {
          SplitText.create(target, {
            type: "words",
            aria: "none",
            autoSplit: false,
            onSplit: (self) =>
              gsap.from(self.words, {
                y: "0.45em",
                opacity: 0,
                duration: 0.7,
                stagger: 0.06,
                ease: EASE_OUT,
                delay,
                scrollTrigger: trigger,
              }),
          });
        } else if (effect === "type") {
          const caret = ref.current?.querySelector<HTMLElement>("[data-caret]");
          SplitText.create(target, {
            type: "words",
            aria: "none",
            autoSplit: false,
            onSplit: (self) => {
              // Fast enough that nobody waits to read: about 25ms a word.
              const tl = gsap.timeline({ delay, scrollTrigger: trigger });
              tl.from(self.words, {
                opacity: 0,
                y: 3,
                duration: 0.18,
                stagger: 0.025,
                ease: "power1.out",
              });
              if (caret) {
                tl.fromTo(caret, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0)
                  .to(caret, {
                    opacity: 0,
                    duration: 0.25,
                    repeat: 3,
                    yoyo: true,
                    ease: "steps(1)",
                  })
                  .to(caret, { opacity: 0, duration: 0.2 });
              }
              return tl;
            },
          });
        } else {
          SplitText.create(target, {
            type: "words",
            aria: "none",
            autoSplit: false,
            onSplit: (self) =>
              gsap.fromTo(
                self.words,
                // 0.55 keeps not-yet-reached words above 3:1 contrast for this large text.
                { opacity: 0.55 },
                {
                  opacity: 1,
                  stagger: 0.1,
                  ease: "none",
                  scrollTrigger: {
                    trigger: ref.current,
                    start: "top 78%",
                    end: "bottom 45%",
                    scrub: 0.4,
                  },
                },
              ),
          });
        }
      });

      mm.add(MOTION_REDUCED, () => {
        if (effect !== "scrub") gsap.from(target, { opacity: 0, ...REDUCED_FADE });
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [text, effect, language], revertOnUpdate: true },
  );

  return (
    <Tag ref={ref} id={id} className={className} data-hero={hero ? "" : undefined}>
      <span className="sr-only">{text}</span>
      <span key={text} data-split aria-hidden="true" className="block">
        {text}
      </span>
      {effect === "type" && (
        <span
          data-caret
          aria-hidden="true"
          className="ms-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-coral opacity-0"
        />
      )}
    </Tag>
  );
}

/**
 * The hero headline: the lead appears word by word, then the accent phrase is written in
 * letter by letter (or word by word where letters must stay joined) with a drawn underline.
 */
export function HeroHeadline({
  lead,
  accent,
  className,
}: {
  lead: string;
  accent: string;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { language } = useI18n();
  const letters = canSplitLetters(language);
  const words = accent.trim().split(/\s+/);
  const last = words.pop() ?? "";
  const rest = words.join(" ");

  useGSAP(
    () => {
      const leadEl = ref.current?.querySelector<HTMLElement>("[data-lead]");
      const accentEls = Array.from(
        ref.current?.querySelectorAll<HTMLElement>("[data-accent]") ?? [],
      );
      const accentEl = accentEls.length ? accentEls : null;
      const underline = ref.current?.querySelector<SVGPathElement>("[data-underline] path");
      if (!leadEl || !accentEl) return;
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const leadSplit = SplitText.create(leadEl, { type: "words", aria: "none" });
        const accentSplit = SplitText.create(accentEl, {
          type: letters ? "words,chars" : "words",
          aria: "none",
        });
        const tl = gsap.timeline({ delay: 0.25 });
        tl.from(leadSplit.words, {
          y: "0.5em",
          opacity: 0,
          filter: "blur(8px)",
          duration: 0.8,
          stagger: 0.09,
          ease: EASE_OUT,
          clearProps: "filter",
        }).from(
          letters ? accentSplit.chars : accentSplit.words,
          {
            yPercent: 60,
            opacity: 0,
            duration: 0.5,
            stagger: letters ? 0.028 : 0.08,
            ease: "power2.out",
          },
          "-=0.35",
        );
        if (underline) {
          const length = underline.getTotalLength();
          tl.fromTo(
            underline,
            { strokeDasharray: length, strokeDashoffset: length },
            { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" },
            "-=0.2",
          );
        }
      });

      mm.add(MOTION_REDUCED, () => {
        gsap.from([leadEl, ...accentEl], { opacity: 0, ...REDUCED_FADE });
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [lead, accent, letters], revertOnUpdate: true },
  );

  return (
    <h1 ref={ref} className={className} data-hero>
      <span className="sr-only">{`${lead} ${accent}`}</span>
      <span aria-hidden="true" className="block">
        <span key={lead} data-lead className="block">
          {lead}
        </span>
        {/* The underline sits under the final word only, so it matches that word's length
            however the phrase wraps, in any language. */}
        <span key={accent} className="block text-primary">
          {rest && (
            <>
              <span data-accent>{rest}</span>{" "}
            </>
          )}
          <span className="relative inline-block whitespace-nowrap">
            <span data-accent className="relative z-10">
              {last}
            </span>
            <svg
              data-underline
              viewBox="0 0 300 20"
              preserveAspectRatio="none"
              className="absolute inset-x-0 -bottom-[0.12em] h-[0.28em] w-full text-coral"
            >
              <path
                d="M3 14 C 70 4, 150 4, 297 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </span>
      </span>
    </h1>
  );
}
