import { History as HistoryIcon } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  Info,
  NotebookText,
  Pill,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { Med, MedicalDataNotice, UrduHint } from "@/components/MedicalText";
import {
  ConfirmDialog,
  EmptyState,
  MedicalField,
  PageEnter,
  PageHeader,
  ProcessingCard,
  StatusBanner,
  isBlankValue,
} from "@/components/app/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScanReviewMarker, StatusBadge } from "@/components/prescription/badges";
import {
  cleanUpOrphans,
  deletePrescriptionRecord,
  loadPrescriptionSummaries,
} from "@/lib/prescription/store";
import type { VerificationStatus } from "@/lib/prescription/model";

type RecordInfo = { status: VerificationStatus };
const UNDO_MS = 8000;

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Scan History — MediSnap" },
      {
        name: "description",
        content:
          "Browse, search and review every medicine and prescription you have scanned with MediSnap.",
      },
      { property: "og:title", content: "Scan History — MediSnap" },
      {
        property: "og:description",
        content:
          "Browse, search and review every medicine and prescription you have scanned with MediSnap.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

type Scan = any;

type Group =
  | { kind: "prescription"; key: string; created_at: string; items: Scan[] }
  | { kind: "label"; key: string; created_at: string; item: Scan };

type Filter = "all" | "label" | "prescription";

const FILTERS = [
  { value: "all", label: "history.filterAll" },
  { value: "label", label: "history.filterMedicines" },
  { value: "prescription", label: "history.filterPrescriptions" },
] as const;

function HistoryPage() {
  const { t, tError } = useI18n();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [viewing, setViewing] = useState<Group | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null);
  // Saved prescriptions with a stored original, by scan_group_id.
  const [records, setRecords] = useState<Map<string, RecordInfo>>(new Map());
  // Originals are removed only once the undo window has passed.
  const finalise = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("scans")
      .select("*")
      .order("created_at", { ascending: false });
    setLoadFailed(Boolean(error));
    setScans(data || []);
    setLoading(false);
    if (error) return;
    const groupIds = new Set(
      (data || []).filter((s) => s.scan_group_id).map((s) => s.scan_group_id as string),
    );
    // Best effort: older records simply have no stored original.
    loadPrescriptionSummaries([...groupIds]).then(
      (m) =>
        setRecords(
          new Map([...m].map(([id, r]) => [id, { status: r.status as VerificationStatus }])),
        ),
      () => setRecords(new Map()),
    );
    cleanUpOrphans(groupIds).catch(() => {});
  }
  useEffect(() => {
    load();
  }, []);

  // Deleting can be undone from the toast: the removed rows are written back unchanged.
  async function undoDelete(rows: Scan[]) {
    const groupId = rows[0]?.scan_group_id as string | undefined;
    if (groupId && finalise.current.has(groupId)) {
      clearTimeout(finalise.current.get(groupId));
      finalise.current.delete(groupId);
    }
    const { error } = await supabase.from("scans").insert(rows);
    if (error) return toast.error(tError(error.message));
    setScans((s) =>
      [...rows, ...s].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    );
    toast.success(t("history.restored"));
  }

  async function confirmDelete() {
    const group = pendingDelete;
    if (!group) return;
    const rows: Scan[] = group.kind === "prescription" ? group.items : [group.item];
    const query = supabase.from("scans").delete();
    const { error } = await (group.kind === "prescription"
      ? query.eq("scan_group_id", group.key)
      : query.eq("id", group.item.id));
    if (error) return toast.error(tError(error.message));
    const ids = new Set(rows.map((r) => r.id));
    setScans((s) => s.filter((x) => !ids.has(x.id)));
    if (group.kind === "prescription" && records.has(group.key)) {
      const key = group.key;
      finalise.current.set(
        key,
        setTimeout(() => {
          finalise.current.delete(key);
          deletePrescriptionRecord(key).catch(() => {}); // retried by the orphan check later
        }, UNDO_MS + 1000),
      );
    }
    toast.success(t("history.deleted"), {
      duration: UNDO_MS,
      action: { label: t("history.undo"), onClick: () => undoDelete(rows) },
    });
  }

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    const grouped = new Map<string, Scan[]>();
    for (const s of scans) {
      if (s.scan_type === "prescription" && s.scan_group_id) {
        const arr = grouped.get(s.scan_group_id) || [];
        arr.push(s);
        grouped.set(s.scan_group_id, arr);
      } else {
        out.push({ kind: "label", key: s.id, created_at: s.created_at, item: s });
      }
    }
    for (const [key, items] of grouped) {
      const sorted = [...items].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      out.push({ kind: "prescription", key, created_at: sorted[0].created_at, items: sorted });
    }
    return out.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [scans]);

  const counts = useMemo(() => {
    const prescriptions = groups.filter((g) => g.kind === "prescription");
    return {
      all: groups.length,
      label: groups.length - prescriptions.length,
      prescription: prescriptions.length,
      needsReview: prescriptions.filter(
        (g) => records.get(g.key)?.status === "NEEDS_PROFESSIONAL_REVIEW",
      ).length,
    };
  }, [groups, records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (filter !== "all" && g.kind !== filter) return false;
      if (!q) return true;
      if (g.kind === "label") return (g.item.medicine_name || "").toLowerCase().includes(q);
      return g.items.some((m) => (m.medicine_name || "").toLowerCase().includes(q));
    });
  }, [groups, search, filter]);

  return (
    <PageEnter className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        guide="history"
        icon={HistoryIcon}
        title={t("history.title")}
        description={t("history.subtitle")}
        actions={
          <Link to="/interactions" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeftRight aria-hidden="true" /> {t("nav.interactions")}
          </Link>
        }
      />

      {loadFailed && (
        <StatusBanner
          tone="danger"
          title={t("common.loadFailedTitle")}
          action={
            <Button variant="outline" size="sm" onClick={load}>
              {t("root.tryAgain")}
            </Button>
          }
        >
          {t("common.loadFailedBody")}
        </StatusBanner>
      )}

      {loading ? (
        <ProcessingCard title={t("common.loading")} />
      ) : groups.length === 0 && !loadFailed ? (
        <EmptyState
          data-tour="history-page-empty"
          icon={ClipboardList}
          title={t("history.empty")}
          body={<UrduHint>ابھی تک کوئی اسکین نہیں</UrduHint>}
          action={
            <Link to="/scanner" className={buttonVariants()}>
              <Pill aria-hidden="true" /> {t("history.scanFirst")}
            </Link>
          }
        />
      ) : groups.length > 0 ? (
        // Records take the wide column; search, filters and a summary of the real records
        // sit beside them on wide screens and above them on narrower ones. The filters come
        // first in the page order so keyboard and screen-reader users reach them first.
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <aside
            aria-label={t("history.toolsLabel")}
            className="space-y-4 xl:sticky xl:top-6 xl:col-start-2 xl:row-start-1"
          >
            <div className="panel space-y-4" data-tour="hist-tools">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={t("history.search")}
                  dir="auto"
                  placeholder={t("history.search")}
                  className="ps-11"
                />
              </div>
              <div
                role="group"
                aria-label={t("history.filterLabel")}
                className="flex flex-wrap gap-2 xl:flex-col"
              >
                {FILTERS.map(({ value, label }) => (
                  <Button
                    key={value}
                    variant={filter === value ? "default" : "outline"}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className="xl:w-full xl:justify-between"
                  >
                    {t(label)}
                    <span className="tabular-nums opacity-80">{counts[value]}</span>
                  </Button>
                ))}
              </div>
              <p role="status" className="text-[0.9375rem] text-muted-foreground">
                {t("history.resultCount", { shown: filtered.length, total: groups.length })}
              </p>
            </div>
            {counts.needsReview > 0 && (
              <StatusBanner
                tone="warning"
                title={t("history.needsReviewTitle", { count: counts.needsReview })}
              >
                {t("history.needsReviewBody")}
              </StatusBanner>
            )}
          </aside>

          <div data-tour="history-page" className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-1">
            <MedicalDataNotice />
            {filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={t("history.noMatchTitle")}
                body={t("history.noMatchBody")}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    {t("history.clearFilters")}
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-4">
                {filtered.map((g, i) => (
                  <li key={g.key} data-tour={i === 0 ? "hist-item" : undefined}>
                    <GroupCard
                      group={g}
                      record={g.kind === "prescription" ? records.get(g.key) : undefined}
                      onView={() => setViewing(g)}
                      onDelete={() => setPendingDelete(g)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <ViewDialog group={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("history.deleteTitle")}
        body={t("history.deleteBody")}
        confirmLabel={t("history.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={confirmDelete}
      />
    </PageEnter>
  );
}

function GroupCard({
  group,
  record,
  onView,
  onDelete,
}: {
  group: Group;
  record?: RecordInfo;
  onView: () => void;
  onDelete: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const isPrescription = group.kind === "prescription";
  const items: Scan[] = group.kind === "prescription" ? group.items : [group.item];
  const flagged = items.some((m) => m.is_dangerous);
  return (
    <article className="panel flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          {isPrescription ? (
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Pill className="h-4 w-4" aria-hidden="true" />
          )}
          {isPrescription ? t("history.prescriptionScan") : t("history.labelScan")}
        </p>
        {flagged && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2.5 py-0.5 text-sm font-semibold text-destructive-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {t("prescription.caution")}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatDateTime(new Date(group.created_at))}
      </p>
      {record && (
        <div className="mt-2">
          <StatusBadge status={record.status} />
        </div>
      )}
      {isPrescription && !record && (
        <p className="mt-2 text-sm text-muted-foreground">{t("rx.history.noOriginal")}</p>
      )}
      {isPrescription && (
        <p className="mt-2 font-medium">
          {t(items.length === 1 ? "history.medicineOne" : "history.medicineMany", {
            count: items.length,
          })}
        </p>
      )}
      <ol className={`mt-3 grid flex-1 gap-2 ${items.length > 1 ? "md:grid-cols-2" : ""}`}>
        {items.map((m, i) => (
          <li key={m.id ?? i} className="rounded-2xl bg-secondary p-3">
            <p className="font-semibold">
              {isPrescription && <span className="text-primary">{i + 1}. </span>}
              {m.medicine_name ? <Med>{m.medicine_name}</Med> : t("history.unnamed")}
              {!isBlankValue(m.medicine_name_urdu) && (
                <span className="urdu"> {m.medicine_name_urdu}</span>
              )}
            </p>
            <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">
              {!isBlankValue(m.dosage) && <Med>{m.dosage}</Med>}
              {!isBlankValue(m.dosage) && !isBlankValue(m.frequency) && ", "}
              {!isBlankValue(m.frequency) && <Med>{m.frequency}</Med>}
            </p>
            <ScanReviewMarker scan={m} />
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {record && (
            <Link to="/prescriptions/$id" params={{ id: group.key }} className={buttonVariants()}>
              <FileText aria-hidden="true" /> {t("rx.openPrescription")}
            </Link>
          )}
          {isPrescription && (
            <Link
              to="/medicines"
              hash={record ? `rx-${group.key}` : undefined}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pill aria-hidden="true" /> {t("nav.medicines")}
            </Link>
          )}
          <Button variant="outline" onClick={onView}>
            {t("history.viewFull")}
          </Button>
        </div>
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/8 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" /> {t("history.delete")}
        </Button>
      </div>
    </article>
  );
}

function ViewDialog({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const { t, formatDateTime } = useI18n();
  const items: Scan[] = !group ? [] : group.kind === "prescription" ? group.items : [group.item];
  const isPrescription = group?.kind === "prescription";
  const interactions = isPrescription
    ? (items.find((i) => i.prescription_data?.interactions)?.prescription_data?.interactions as
        | string
        | undefined)
    : undefined;
  const doctorNotes = items.find((i) => !isBlankValue(i.doctor_notes))?.doctor_notes;
  const doctorNotesUrdu = items.find((i) => !isBlankValue(i.doctor_notes_urdu))?.doctor_notes_urdu;

  return (
    <Dialog
      open={Boolean(group)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl border-border bg-card">
        <DialogTitle className="display flex items-center gap-2 pe-8 text-2xl font-normal">
          {isPrescription ? (
            <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <Pill className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          )}
          {isPrescription ? t("history.prescriptionDetails") : t("history.medicineDetails")}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          {group && formatDateTime(new Date(group.created_at))}
        </DialogDescription>
        <div className="space-y-4">
          <MedicalDataNotice />
          {!isBlankValue(interactions) && (
            <section className="panel-tint">
              <p className="flex items-center gap-2 font-semibold">
                <Info className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{" "}
                {t("history.interactions")}
              </p>
              <p className="mt-2">
                <Med>{interactions}</Med>
              </p>
            </section>
          )}
          {items.map((m, i) => (
            <section
              key={m.id ?? i}
              className={`rounded-2xl border p-4 ${m.is_dangerous ? "border-2 border-destructive" : "border-border"}`}
            >
              <h3 className="text-lg font-bold">
                {isPrescription && <span className="text-primary">{i + 1}. </span>}
                <Med>{m.medicine_name}</Med>
              </h3>
              {!isBlankValue(m.medicine_name_urdu) && (
                <p className="urdu">{m.medicine_name_urdu}</p>
              )}
              <ScanReviewMarker scan={m} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <MedicalField
                  icon={Pill}
                  label={t("scan.dosage")}
                  en={m.dosage}
                  ur={m.dosage_urdu}
                />
                <MedicalField
                  icon={Clock}
                  label={t("scan.frequency")}
                  en={m.frequency}
                  ur={m.frequency_urdu}
                />
                {!isBlankValue(m.prescription_data?.duration) && (
                  <MedicalField
                    icon={CalendarDays}
                    label={t("scan.duration")}
                    en={m.prescription_data.duration}
                    ur={m.prescription_data.duration_urdu}
                  />
                )}
                <MedicalField
                  icon={NotebookText}
                  label={t("scan.instructions")}
                  en={m.food_interactions}
                  ur={m.food_interactions_urdu}
                />
                {!(
                  isBlankValue(m.warnings) &&
                  m.prescription_data?.source === "prescription_safety_v1"
                ) && (
                  <div className="sm:col-span-2">
                    <MedicalField
                      icon={AlertTriangle}
                      label={t("scan.warnings")}
                      en={m.warnings}
                      ur={m.warnings_urdu}
                      emphasis
                    />
                  </div>
                )}
              </div>
            </section>
          ))}
          {!isBlankValue(doctorNotes) && (
            <section className="panel-tint">
              <p className="font-semibold">{t("history.doctorNotes")}</p>
              <p className="mt-2">
                <Med>{doctorNotes}</Med>
              </p>
              {!isBlankValue(doctorNotesUrdu) && <p className="urdu mt-1">{doctorNotesUrdu}</p>}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
