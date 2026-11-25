import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { HealthCalendar } from "@/components/app/HealthCalendar";
import { PageEnter, PageHeader, ProcessingCard, StatusBanner } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Health Calendar — MediSnap" },
      {
        name: "description",
        content: "Your symptom diary entries and saved medicines on a monthly calendar.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { t } = useI18n();
  const [symptoms, setSymptoms] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Same reads as the Doctor Report, which has always drawn its calendar from these tables.
  async function load() {
    setLoading(true);
    const [s, sc] = await Promise.all([
      supabase.from("symptoms").select("*").order("created_at", { ascending: true }),
      supabase.from("scans").select("*").order("created_at", { ascending: false }),
    ]);
    setFailed(Boolean(s.error || sc.error));
    setSymptoms(s.data || []);
    setScans(sc.data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <PageEnter className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        guide="calendar"
        icon={CalendarDays}
        title={t("calendar.title")}
        description={t("calendar.subtitle")}
      />
      {failed && (
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
      ) : (
        <section aria-label={t("calendar.title")} className="panel max-sm:!px-2.5">
          <HealthCalendar symptoms={symptoms} scans={scans} />
        </section>
      )}
    </PageEnter>
  );
}
