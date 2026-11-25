// Small pictures of result screens for the guided tour, for steps whose real screen only
// appears after an actual scan or check. Each one is clearly labelled "Example, not your
// data", uses made-up medicine names, is drawn here (nothing is loaded, saved or sent) and
// uses the app's own labels, so it looks like what the person will really see.
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CircleDashed,
  FileText,
  Hourglass,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Check,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { Med } from "@/components/MedicalText";
import type { ExampleId } from "./steps";

function Frame({ children, caption }: { children: React.ReactNode; caption?: string }) {
  const { t } = useI18n();
  return (
    <figure className="mt-3 overflow-hidden rounded-2xl border border-dashed border-[#cdbff0] bg-[#FBFAFE]" data-tour-example>
      <p className="flex items-center gap-1.5 border-b border-dashed border-[#e3daf6] bg-[#F4EFFC] px-3 py-1.5 text-[0.75rem] font-bold uppercase tracking-wide text-primary">
        <span aria-hidden="true">◆</span> {t("guide.example")}
      </p>
      <div className="space-y-2 p-3 text-[0.875rem]">{children}</div>
      {caption && (
        <figcaption className="border-t border-dashed border-[#e3daf6] px-3 py-1.5 text-[0.8125rem] text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

const Chip = ({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${
      tone === "ok"
        ? "bg-success/12 text-success"
        : tone === "warn"
          ? "bg-warning/15 text-[#8a5a00]"
          : tone === "bad"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-foreground/80"
    }`}
  >
    {children}
  </span>
);

const Fake = ({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) => (
  <span
    aria-hidden="true"
    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.75rem] font-semibold ${
      primary ? "bg-primary text-primary-foreground" : "border border-border bg-card"
    }`}
  >
    {children}
  </span>
);

export function TourExample({ id }: { id: ExampleId }) {
  const { t } = useI18n();
  switch (id) {
    case "camera":
      return (
        <Frame caption={t("guide.ex.camera.caption")}>
          <div className="relative mx-auto grid h-20 w-40 place-items-center rounded-xl bg-[#2a2140]" aria-hidden="true">
            <span className="absolute inset-2 rounded-lg border-2 border-dashed border-white/50" />
            <span className="rounded bg-white/90 px-2 py-1 text-[0.6875rem] font-bold text-[#2a2140]">
              PANADOL 500mg
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            <Fake primary>
              <Camera className="h-3 w-3" /> {t("camera.capture")}
            </Fake>
            <Fake>
              <RotateCcw className="h-3 w-3" /> {t("camera.retake")}
            </Fake>
            <Fake primary>
              <Check className="h-3 w-3" /> {t("camera.use")}
            </Fake>
          </div>
        </Frame>
      );
    case "scanResult":
      return (
        <Frame caption={t("guide.ex.scanResult.caption")}>
          <p className="font-semibold">
            <Med>Panadol 500mg</Med>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t("scan.dosage")}</dt>
            <dd>{t("guide.ex.scanResult.dose")}</dd>
            <dt className="text-muted-foreground">{t("scan.warnings")}</dt>
            <dd>{t("guide.ex.scanResult.warning")}</dd>
          </dl>
          <p className="flex items-start gap-1.5 rounded-lg bg-secondary px-2 py-1 text-[0.8125rem]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            {t("guide.ex.aiCanBeWrong")}
          </p>
        </Frame>
      );
    case "rxReview":
      return (
        <Frame caption={t("guide.ex.rxReview.caption")}>
          <div className="grid grid-cols-[3.25rem_1fr] gap-2">
            <div className="grid h-16 place-items-center rounded-lg border border-border bg-card" aria-hidden="true">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <ul className="space-y-1.5">
              <li className="flex flex-wrap items-center gap-1.5">
                <Med>Augmentin 625mg</Med>
                <Chip>{t("meds.conf.high")}</Chip>
              </li>
              <li className="flex flex-wrap items-center gap-1.5">
                <Med>Metf?rmin</Med>
                <Chip tone="warn">{t("meds.conf.review")}</Chip>
              </li>
              <li className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">———</span>
                <Chip tone="bad">{t("meds.conf.unclear")}</Chip>
              </li>
            </ul>
          </div>
          <p className="text-[0.8125rem] text-muted-foreground">{t("guide.ex.rxReview.left")}</p>
        </Frame>
      );
    case "statuses":
      return (
        <Frame>
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <Chip tone="warn">
                <CircleDashed className="h-3 w-3" aria-hidden="true" /> {t("meds.id.needs")}
              </Chip>
              <span className="text-[0.8125rem]">{t("guide.ex.statuses.needs")}</span>
            </li>
            <li className="flex items-start gap-2">
              <Chip tone="bad">
                <Hourglass className="h-3 w-3" aria-hidden="true" /> {t("meds.id.pending")}
              </Chip>
              <span className="text-[0.8125rem]">{t("guide.ex.statuses.pending")}</span>
            </li>
            <li className="flex items-start gap-2">
              <Chip tone="ok">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" /> {t("meds.id.confirmed")}
              </Chip>
              <span className="text-[0.8125rem]">{t("guide.ex.statuses.confirmed")}</span>
            </li>
            <li className="flex items-start gap-2">
              <Chip tone="ok">
                <ScanLine className="h-3 w-3" aria-hidden="true" /> {t("meds.id.confirmedPackaging")}
              </Chip>
              <span className="text-[0.8125rem]">{t("guide.ex.statuses.packaging")}</span>
            </li>
          </ul>
        </Frame>
      );
    case "packaging":
      return (
        <Frame caption={t("guide.ex.packaging.caption")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t("meds.scan.boxSays")}</dt>
            <dd>
              <Med>Metformin 850 mg</Med>
            </dd>
            <dt className="text-muted-foreground">{t("meds.scan.rxSays")}</dt>
            <dd>
              <Med>Metf?rmin</Med>
            </dd>
          </dl>
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="ok">{t("meds.scan.outMatch")}</Chip>
            <Chip tone="warn">{t("meds.scan.outPossible")}</Chip>
            <Chip tone="bad">{t("meds.scan.outNoMatch")}</Chip>
            <Chip>{t("meds.scan.outUnable")}</Chip>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Fake primary>{t("meds.scan.yes")}</Fake>
            <Fake>{t("meds.scan.no")}</Fake>
          </div>
        </Frame>
      );
    case "interaction":
      return (
        <Frame caption={t("guide.ex.interaction.caption")}>
          <p className="font-semibold">
            <Med>Brufen 400mg</Med> + <Med>Disprin 300mg</Med>
          </p>
          <Chip tone="warn">
            <ShieldAlert className="h-3 w-3" aria-hidden="true" /> {t("guide.ex.interaction.level")}
          </Chip>
          <p className="text-[0.8125rem]">{t("guide.ex.interaction.text")}</p>
        </Frame>
      );
    case "reportPdf":
      return (
        <Frame caption={t("guide.ex.reportPdf.caption")}>
          <div className="mx-auto w-36 space-y-1.5 rounded-md border border-border bg-card p-2 shadow-sm" aria-hidden="true">
            <span className="block h-1 rounded bg-primary" />
            <span className="block text-[0.625rem] font-bold">{t("rpt.kindVisit")}</span>
            <span className="block h-1.5 w-3/4 rounded bg-secondary" />
            <span className="block h-1.5 w-2/3 rounded bg-secondary" />
            <svg viewBox="0 0 100 28" className="h-7 w-full">
              <polyline points="2,22 20,18 38,8 56,12 74,16 98,20" fill="none" stroke="#4B2E83" strokeWidth="2" />
            </svg>
            <span className="block h-1.5 w-5/6 rounded bg-secondary" />
          </div>
        </Frame>
      );
  }
}
