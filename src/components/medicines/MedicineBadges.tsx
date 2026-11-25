// Plain-language status chips for My Medicines. Every chip carries an icon and words, so
// meaning never depends on colour alone.
import { BadgeCheck, CircleDashed, CircleHelp, Eye, Hourglass, ScanLine } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { Confidence, Identity, MyMedicine } from "@/lib/medicines";

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold";

const IDENTITY_UI: Record<Identity, { label: MessageKey; icon: typeof BadgeCheck; tone: string }> =
  {
    confirmed: {
      label: "meds.id.confirmed",
      icon: BadgeCheck,
      tone: "border-success/40 bg-success/8 text-success",
    },
    needs_identification: {
      label: "meds.id.needs",
      icon: CircleDashed,
      tone: "border-warning/50 bg-warning/8 text-warning",
    },
    pending_verification: {
      label: "meds.id.pending",
      icon: Hourglass,
      tone: "border-destructive/50 bg-destructive/6 text-destructive",
    },
  };

const CONFIDENCE_UI: Record<Confidence, { label: MessageKey; icon: typeof Eye; tone: string }> = {
  high: { label: "meds.conf.high", icon: Eye, tone: "border-border bg-secondary text-foreground" },
  review: {
    label: "meds.conf.review",
    icon: CircleHelp,
    tone: "border-warning/50 bg-warning/8 text-warning",
  },
  unclear: {
    label: "meds.conf.unclear",
    icon: CircleHelp,
    tone: "border-destructive/50 bg-destructive/6 text-destructive",
  },
};

export function IdentityBadge({
  medicine,
}: {
  medicine: Pick<MyMedicine, "identity" | "confirmedVia">;
}) {
  const { t } = useI18n();
  const ui = IDENTITY_UI[medicine.identity];
  const Icon = medicine.confirmedVia === "packaging" ? ScanLine : ui.icon;
  return (
    <span data-identity={medicine.identity} className={`${chip} ${ui.tone}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {medicine.identity === "confirmed" && medicine.confirmedVia === "packaging"
        ? t("meds.id.confirmedPackaging")
        : t(ui.label)}
    </span>
  );
}

/** How readable the AI found the name. Shown only while the medicine isn't confirmed. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const { t } = useI18n();
  const ui = CONFIDENCE_UI[confidence];
  const Icon = ui.icon;
  return (
    <span data-confidence={confidence} className={`${chip} ${ui.tone}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t(ui.label)}
    </span>
  );
}
