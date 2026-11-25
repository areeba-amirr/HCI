// Scan the medicine's box or strip, then compare what is printed with the prescription.
// The packaging is supporting evidence only: the person decides whether it is the medicine
// their doctor prescribed, and nothing is confirmed unless they say so.
import { useEffect, useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RefreshCcw, ScanLine } from "lucide-react";
import { readPackaging } from "@/lib/ai.functions";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { Med } from "@/components/MedicalText";
import { ImageDropzone } from "@/components/app/ImageDropzone";
import { StatusBanner } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { compareNames, compareStrengths, type MyMedicine } from "@/lib/medicines";
import { ReadAloud } from "@/components/ReadAloud";

type Field = { value: string | null; status: "clear" | "uncertain" | "unreadable" | "not_found" };
type Reading = {
  isPackaging: boolean;
  fields: { name: Field; generic_name: Field; strength: Field };
};

/** What the comparison means for the person. Never a decision: only they can confirm. */
type Outcome = "match" | "possible" | "no_match" | "unable";
const OUTCOME_UI: Record<
  Exclude<Outcome, "unable">,
  { title: MessageKey; tone: "success" | "warning" | "danger" }
> = {
  match: { title: "meds.scan.outMatch", tone: "success" },
  possible: { title: "meds.scan.outPossible", tone: "warning" },
  no_match: { title: "meds.scan.outNoMatch", tone: "danger" },
};
const MATCH_KEY: Record<ReturnType<typeof compareNames>, MessageKey> = {
  same: "meds.scan.matchSame",
  similar: "meds.scan.matchSimilar",
  different: "meds.scan.matchDifferent",
  unknown: "meds.scan.matchUnknown",
};

export function PackagingScanDialog({
  medicine,
  open,
  onOpenChange,
  onConfirm,
}: {
  medicine: MyMedicine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the name the person chose; the caller saves it with packaging evidence. */
  onConfirm: (name: string) => Promise<void>;
}) {
  const read = useServerFn(readPackaging);
  const { t, tError } = useI18n();
  const nameId = useId();
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A fresh start each time the dialog opens; the photo is never kept or uploaded.
  useEffect(() => {
    if (open) {
      setPhoto(null);
      setReading(null);
      setName("");
      setError(null);
    }
  }, [open]);

  async function runRead() {
    if (!photo) return;
    setBusy("read");
    setError(null);
    try {
      const r = (await read({ data: { imageBase64: photo } })) as Reading;
      setReading(r);
      setName(r.fields.name.value ?? "");
    } catch (e) {
      setError(e instanceof Error && e.message ? tError(e.message) : t("meds.scan.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!name.trim()) return;
    setBusy("save");
    try {
      await onConfirm(name.trim());
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  }

  const box = reading?.fields;
  const boxName =
    box && (box.name.status === "clear" || box.name.status === "uncertain") ? box.name.value : null;
  const boxStrength =
    box && (box.strength.status === "clear" || box.strength.status === "uncertain")
      ? box.strength.value
      : null;
  const match = compareNames(medicine.aiName, boxName);
  const strengthMatch = compareStrengths(medicine.strength, boxStrength);
  const outcome: Outcome | null = !reading
    ? null
    : !reading.isPackaging || !boxName
      ? "unable"
      : match === "same"
        ? "match"
        : match === "different"
          ? "no_match"
          : "possible";
  /** Start again: clears the photo so the camera and upload options show. */
  const again = () => {
    setReading(null);
    setPhoto(null);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-packaging-dialog>
        <DialogTitle className="display text-2xl font-normal">{t("meds.scan.title")}</DialogTitle>
        <DialogDescription className="text-[0.9375rem]">{t("meds.scan.intro")}</DialogDescription>

        {!reading ? (
          <div className="space-y-4">
            <ImageDropzone
              preview={photo}
              onImage={(url) => {
                setPhoto(url);
                setError(null);
              }}
              onClear={() => setPhoto(null)}
              prompt={t("meds.scan.prompt")}
              hint={t("meds.scan.hint")}
              previewAlt={t("meds.scan.previewAlt")}
              disabled={busy !== null}
              cameraTitle={t("camera.titlePackaging")}
              cameraInstructions={t("camera.hintMedicine")}
            />
            {error && <StatusBanner tone="danger" title={error} />}
            <Button
              className="w-full"
              size="lg"
              disabled={!photo || busy !== null}
              onClick={runRead}
            >
              {busy === "read" ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ScanLine aria-hidden="true" />
              )}
              {busy === "read" ? t("meds.scan.reading") : t("meds.scan.read")}
            </Button>
          </div>
        ) : outcome === "unable" ? (
          <div className="space-y-4" data-scan-result="unable">
            <StatusBanner tone="warning" title={t("meds.scan.outUnable")}>
              <p>
                {!reading.isPackaging ? t("meds.scan.notPackaging") : t("meds.scan.nameUnreadable")}
              </p>
              <p className="mt-1">{t("meds.scan.tryAgainHint")}</p>
            </StatusBanner>
            <Button variant="outline" className="w-full" onClick={again}>
              <RefreshCcw aria-hidden="true" /> {t("meds.scan.again")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-scan-result={outcome}>
            <StatusBanner tone={OUTCOME_UI[outcome!].tone} title={t(OUTCOME_UI[outcome!].title)}>
              <span data-match={match}>
                {t(MATCH_KEY[match])}
                {strengthMatch === "different" && <> {t("meds.scan.strengthDifferent")}</>}
              </span>
            </StatusBanner>
            <ReadAloud
              text={() =>
                [
                  t(OUTCOME_UI[outcome!].title) + ".",
                  t(MATCH_KEY[match]),
                  strengthMatch === "different" ? t("meds.scan.strengthDifferent") : "",
                  `${t("meds.scan.boxSays")}: ${[boxName, boxStrength].filter(Boolean).join(" ")}.`,
                  `${t("meds.scan.rxSays")}: ${medicine.aiName ?? t("meds.scan.rxUnreadable")}.`,
                  t("meds.scan.evidenceNote"),
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            />
            <dl className="grid gap-3 rounded-2xl bg-secondary p-4 text-[0.9375rem]">
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">
                  {t("meds.scan.boxSays")}
                </dt>
                <dd className="mt-0.5 text-lg font-semibold">
                  <Med>{[boxName, boxStrength].filter(Boolean).join(" ")}</Med>
                  {box!.name.status === "uncertain" && (
                    <span className="ms-2 text-sm font-normal text-warning">
                      {t("meds.scan.partlyReadable")}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted-foreground">
                  {t("meds.scan.rxSays")}
                </dt>
                <dd className="mt-0.5">
                  {medicine.aiName ? (
                    <Med>{[medicine.aiName, medicine.strength].filter(Boolean).join(" ")}</Med>
                  ) : (
                    <span className="text-muted-foreground">{t("meds.scan.rxUnreadable")}</span>
                  )}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">{t("meds.scan.evidenceNote")}</p>

            {outcome === "no_match" ? (
              <>
                <p className="text-[0.9375rem]">{t("meds.scan.noMatchHelp")}</p>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  disabled={busy !== null}
                  onClick={() => onOpenChange(false)}
                >
                  {t("meds.scan.no")}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor={nameId} className="field-label">
                    {t("meds.scan.nameLabel")}
                  </label>
                  <Input
                    id={nameId}
                    value={name}
                    dir="auto"
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button size="lg" disabled={!name.trim() || busy !== null} onClick={confirm}>
                    {busy === "save" ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" />
                    )}
                    {outcome === "possible" ? t("meds.scan.yesChecked") : t("meds.scan.yes")}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => onOpenChange(false)}
                  >
                    {t("meds.scan.no")}
                  </Button>
                </div>
              </>
            )}
            <Button variant="ghost" className="w-full" disabled={busy !== null} onClick={again}>
              <RefreshCcw aria-hidden="true" /> {t("meds.scan.again")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
