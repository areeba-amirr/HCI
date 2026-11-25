import { PageGuideButton } from "@/components/tour/PageGuide";
import type { ChapterId } from "@/components/tour/steps";
import { useRef } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  OctagonAlert,
  type LucideIcon,
} from "lucide-react";
import { gsap, MOTION_OK, MOTION_REDUCED, EASE_OUT, REDUCED_FADE, useGSAP } from "@/lib/motion";
import { Med, MedicalValue } from "@/components/MedicalText";
import { useI18n } from "@/i18n/I18nProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

/** One short entrance per screen, so content arriving reads as a page change. */
export function PageEnter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const items = ref.current?.children;
      if (!items?.length) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(items, {
          y: 10,
          opacity: 0,
          duration: 0.3,
          stagger: 0.04,
          ease: EASE_OUT,
          clearProps: "all",
        });
      });
      mm.add(MOTION_REDUCED, () => {
        gsap.from(items, { opacity: 0, ...REDUCED_FADE, clearProps: "all" });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  urdu,
  actions,
  icon: Icon,
  tour,
  guide,
}: {
  /** The guided-tour chapter for this page: shows a "How to use this page" button. */
  guide?: ChapterId;
  icon?: LucideIcon;
  /** Anchor for the guided tour, when the page's heading is what a step introduces. */
  tour?: string;
  title: string;
  description?: string;
  urdu?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div data-tour={tour} className="min-w-0 max-w-2xl">
        {Icon && (
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(145deg,#5A3A96,#4B2E83)] text-primary-foreground shadow-[0_10px_24px_-12px_rgb(75_46_131/0.8)]">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
        )}
        <h1 className="display text-3xl md:text-[2.75rem]">{title}</h1>
        {description && <p className="mt-2 text-muted-foreground md:text-lg">{description}</p>}
        {urdu}
      </div>
      {(actions || guide) && (
        <div className="flex flex-wrap gap-2">
          {guide && <PageGuideButton chapter={guide} />}
          {actions}
        </div>
      )}
    </header>
  );
}

const TONES = {
  info: { icon: Info, wrap: "border-border bg-secondary", icon_: "text-primary" },
  success: { icon: CheckCircle2, wrap: "border-success/40 bg-success/8", icon_: "text-success" },
  warning: { icon: AlertTriangle, wrap: "border-warning/50 bg-warning/8", icon_: "text-warning" },
  danger: {
    icon: OctagonAlert,
    wrap: "border-destructive/60 bg-destructive/6",
    icon_: "text-destructive",
  },
} as const;

/** Status always carries an icon and words, never colour alone. */
export function StatusBanner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof TONES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { icon: Icon, wrap, icon_ } = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-2xl border p-4 ${wrap}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${icon_}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={`text-[0.9375rem] ${title ? "mt-1" : ""}`}>{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  "data-tour": tour,
}: {
  icon: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  /** Anchor for the guided tour. */
  "data-tour"?: string;
}) {
  return (
    <div data-tour={tour} className="panel-tint flex flex-col items-center gap-3 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="display text-2xl">{title}</p>
      {body && <div className="max-w-md text-muted-foreground">{body}</div>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Says what is happening while the AI works. The app can't know a percentage, so it doesn't claim one. */
export function ProcessingCard({ title, detail }: { title: string; detail?: string }) {
  return (
    // data-tour-busy: the guided tour waits while a page is still loading.
    <div role="status" className="panel" data-tour-busy>
      <p className="font-semibold">{title}</p>
      {detail && <p className="mt-1 text-[0.9375rem] text-muted-foreground">{detail}</p>}
      <div className="progress-track mt-4" aria-hidden="true">
        <div className="progress-sweep" />
      </div>
    </div>
  );
}

/** Where the person is in a task and what remains. */
export function FlowSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                done
                  ? "bg-success text-success-foreground"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "border border-input text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className={active ? "font-semibold" : "text-muted-foreground"}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function isBlankValue(v?: string | null) {
  if (!v) return true;
  const t = String(v).trim();
  return t === "" || t.toLowerCase() === "n/a" || t === "دستیاب نہیں";
}

/** A medical value exactly as stored, in English and Urdu, under a translated label. */
export function MedicalField({
  icon: Icon,
  label,
  en,
  ur,
  emphasis,
}: {
  icon: LucideIcon;
  label: string;
  en?: string | null;
  ur?: string | null;
  emphasis?: boolean;
}) {
  const { t } = useI18n();
  const blank = isBlankValue(en) && isBlankValue(ur);
  return (
    <div className={`rounded-2xl p-4 ${emphasis ? "bg-destructive/6" : "bg-secondary"}`}>
      <p
        className={`flex items-center gap-2 text-sm font-semibold ${emphasis ? "text-destructive" : "text-muted-foreground"}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </p>
      {blank ? (
        <p className="mt-2 text-[0.9375rem] text-muted-foreground">{t("scan.notAvailable")}</p>
      ) : (
        <div className="mt-2">
          <MedicalValue original={isBlankValue(en) ? null : en} urdu={isBlankValue(ur) ? null : ur} />
        </div>
      )}
    </div>
  );
}

/** Guards an action that can't be casually undone, and names what will happen. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-3xl border-border bg-card">
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle className="display text-2xl font-normal">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-base text-muted-foreground">
            {body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel className={buttonVariants({ variant: "outline" })}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: destructive ? "destructive" : "default" })}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
