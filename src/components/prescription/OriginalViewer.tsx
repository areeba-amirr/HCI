import { useState } from "react";
import { ExternalLink, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nProvider";
import type { ProcessedPage } from "@/lib/prescription/files";

const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * The original prescription, always available beside what was read from it, so every
 * value can be checked against its source. Zoom works by buttons (not only pinch), and the
 * page scrolls inside its frame when enlarged.
 */
export function OriginalViewer({
  pages,
  onOpenOriginal,
  className = "",
}: {
  pages: ProcessedPage[];
  /** Opens the stored, unprocessed original file (saved prescriptions only). */
  onOpenOriginal?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(0);
  const [full, setFull] = useState(false);
  const current = pages[Math.min(page, pages.length - 1)];

  return (
    <section aria-labelledby="original-heading" className={`panel space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="original-heading" className="text-lg font-semibold">
          {t("rx.original.title")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setFull(true)}>
            <Maximize2 aria-hidden="true" /> {t("rx.original.enlarge")}
          </Button>
          {onOpenOriginal && (
            <Button variant="outline" size="sm" onClick={onOpenOriginal}>
              <ExternalLink aria-hidden="true" /> {t("rx.original.openFile")}
            </Button>
          )}
        </div>
      </div>
      {pages.length > 1 && <PagePicker count={pages.length} page={page} onPage={setPage} />}
      {current && (
        <ZoomFrame page={current} index={page} total={pages.length} heightClass="max-h-[60vh]" />
      )}

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="flex h-[94vh] max-w-[96vw] flex-col gap-3 rounded-3xl border-border bg-card p-4 sm:max-w-[96vw]">
          <DialogTitle className="pe-8 text-lg font-semibold">{t("rx.original.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("rx.original.dialogHelp")}</DialogDescription>
          {pages.length > 1 && <PagePicker count={pages.length} page={page} onPage={setPage} />}
          {current && (
            <ZoomFrame
              page={current}
              index={page}
              total={pages.length}
              heightClass="flex-1 min-h-0"
              initialZoom={1}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PagePicker({
  count,
  page,
  onPage,
}: {
  count: number;
  page: number;
  onPage: (p: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t("rx.original.pages")} className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Button
          key={i}
          size="sm"
          variant={i === page ? "default" : "outline"}
          aria-pressed={i === page}
          onClick={() => onPage(i)}
        >
          {t("rx.original.pageN", { n: i + 1 })}
        </Button>
      ))}
    </div>
  );
}

function ZoomFrame({
  page,
  index,
  total,
  heightClass,
  initialZoom = 1,
}: {
  page: ProcessedPage;
  index: number;
  total: number;
  heightClass: string;
  initialZoom?: number;
}) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(initialZoom);
  const zi = ZOOMS.indexOf(zoom);
  return (
    <div
      className={`flex flex-col gap-2 ${heightClass.includes("flex-1") ? "min-h-0 flex-1" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={zi <= 0}
          onClick={() => setZoom(ZOOMS[zi - 1])}
          aria-label={t("rx.original.zoomOut")}
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <span
          className="min-w-14 text-center text-sm font-semibold tabular-nums"
          aria-live="polite"
        >
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={zi >= ZOOMS.length - 1}
          onClick={() => setZoom(ZOOMS[zi + 1])}
          aria-label={t("rx.original.zoomIn")}
        >
          <ZoomIn aria-hidden="true" />
        </Button>
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label={t("rx.original.frame", { n: index + 1, total })}
        className={`overflow-auto rounded-2xl border border-border bg-[#f3f0f7] focus-visible:outline-2 focus-visible:outline-primary ${heightClass}`}
      >
        <img
          src={page.dataUrl}
          alt={t("rx.original.alt", { n: index + 1, total })}
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
          className="mx-auto block h-auto"
          draggable={false}
        />
      </div>
    </div>
  );
}
