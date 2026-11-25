import {
  Bot,
  CircleCheck,
  CircleMinus,
  CircleQuestionMark,
  EyeOff,
  PencilLine,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { ExtractionStatus, MedicineField, VerificationStatus } from "@/lib/prescription/model";

// Every status is shown as an icon plus words, never colour alone. Shapes differ too, so
// the badges stay distinct in greyscale and for colour-blind readers.
export const VERIFICATION_UI: Record<
  VerificationStatus,
  { icon: LucideIcon; label: MessageKey; help: MessageKey; cls: string }
> = {
  AI_EXTRACTED_UNVERIFIED: {
    icon: Bot,
    label: "rx.status.unverified",
    help: "rx.status.unverifiedHelp",
    cls: "border-border bg-secondary text-foreground",
  },
  USER_CONFIRMED: {
    icon: UserCheck,
    label: "rx.status.confirmed",
    help: "rx.status.confirmedHelp",
    cls: "border-success/50 bg-success/8 text-success",
  },
  USER_CORRECTED: {
    icon: PencilLine,
    label: "rx.status.corrected",
    help: "rx.status.correctedHelp",
    cls: "border-primary/40 bg-accent text-primary",
  },
  PROFESSIONALLY_VERIFIED: {
    icon: ShieldCheck,
    label: "rx.status.professional",
    help: "rx.status.professionalHelp",
    cls: "border-success/50 bg-success/8 text-success",
  },
  NEEDS_PROFESSIONAL_REVIEW: {
    icon: Stethoscope,
    label: "rx.status.needsReview",
    help: "rx.status.needsReviewHelp",
    cls: "border-coral-ink/60 bg-coral/10 text-coral-ink",
  },
  UNREADABLE: {
    icon: EyeOff,
    label: "rx.status.unreadable",
    help: "rx.status.unreadableHelp",
    cls: "border-coral-ink/60 bg-coral/10 text-coral-ink",
  },
};

export const READABILITY_UI: Record<ExtractionStatus, { icon: LucideIcon; label: MessageKey }> = {
  clear: { icon: CircleCheck, label: "rx.read.clear" },
  uncertain: { icon: CircleQuestionMark, label: "rx.read.uncertain" },
  unreadable: { icon: EyeOff, label: "rx.read.unreadable" },
  not_found: { icon: CircleMinus, label: "rx.read.notFound" },
};

export const FIELD_LABEL: Record<MedicineField, MessageKey> = {
  name: "rx.field.name",
  brand_name: "rx.field.brand",
  generic_name: "rx.field.generic",
  strength: "rx.field.strength",
  dosage: "rx.field.dosage",
  frequency: "rx.field.frequency",
  duration: "rx.field.duration",
  route: "rx.field.route",
  instructions: "rx.field.instructions",
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: VerificationStatus;
  size?: "sm" | "lg";
}) {
  const { t } = useI18n();
  const { icon: Icon, label, cls } = VERIFICATION_UI[status];
  return (
    <span
      data-status={status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold ${cls} ${
        size === "lg" ? "px-3.5 py-1.5 text-base" : "px-2.5 py-0.5 text-sm"
      }`}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
      {t(label)}
    </span>
  );
}

export function ReadabilityTag({ status }: { status: ExtractionStatus }) {
  const { t } = useI18n();
  const { icon: Icon, label } = READABILITY_UI[status];
  const flagged = status === "uncertain" || status === "unreadable";
  return (
    <span
      data-readability={status}
      className={`inline-flex items-center gap-1 text-sm ${flagged ? "font-semibold text-coral-ink" : "text-muted-foreground"}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t(label)}
    </span>
  );
}

/** Review details MediSnap stores on a History row for prescriptions saved with review. */
export function scanReview(scan: { prescription_data?: unknown } | null | undefined) {
  const d = scan?.prescription_data as
    | { source?: string; review_status?: VerificationStatus; corrected_fields?: string[] }
    | null
    | undefined;
  if (d?.source !== "prescription_safety_v1" || !d.review_status) return null;
  return { status: d.review_status, corrected: (d.corrected_fields ?? []).length > 0 };
}

/** The status of a saved medicine wherever it appears (History, Calendar), in words. */
export function ScanReviewMarker({ scan }: { scan: { prescription_data?: unknown } }) {
  const { t } = useI18n();
  const info = scanReview(scan);
  if (!info) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      <StatusBadge status={info.status} />
      {info.corrected && info.status !== "USER_CORRECTED" && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-accent px-2.5 py-0.5 text-sm font-semibold text-primary">
          <PencilLine className="h-4 w-4" aria-hidden="true" />
          {t("rx.history.correctedBadge")}
        </span>
      )}
    </span>
  );
}
