import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Accessibility,
  CheckCircle2,
  Compass,
  Languages,
  Loader2,
  LogOut,
  Play,
  Save,
  Settings,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSelector } from "@/components/LanguageSelector";
import { PageEnter, PageHeader, ProcessingCard, StatusBanner } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTour } from "@/components/tour/Tour";
import { CHAPTERS } from "@/components/tour/steps";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [{ title: "Settings — MediSnap" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

/**
 * Profile and settings. Everything here uses what MediSnap already had: the Supabase
 * account (display name is the existing full_name field set at sign-up), the language
 * preference and sign-out. No new tables or columns.
 */
function SettingsPage() {
  const { t, formatDate } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setName((data.user?.user_metadata?.full_name as string | undefined) ?? "");
    });
  }, []);

  const original = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const changed = name.trim() !== original.trim();

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("settings.nameRequired"));
    setSaving(true);
    const { data, error: updateError } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    });
    setSaving(false);
    if (updateError) return setError(t("settings.saveFailed"));
    if (data.user) setUser(data.user);
    toast.success(t("settings.saved"));
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success(t("nav.signedOut"));
  }

  if (!user) return <ProcessingCard title={t("common.loading")} />;

  return (
    <PageEnter className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        guide="settings"
        icon={Settings}
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />

      <section aria-labelledby="profile" className="panel" data-tour="set-name">
        <h2 id="profile" className="display flex items-center gap-2 text-2xl">
          <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />{" "}
          {t("settings.profileTitle")}
        </h2>
        <form onSubmit={saveName} className="mt-4 space-y-4">
          <div>
            <label htmlFor="display-name" className="field-label">
              {t("settings.nameLabel")}
            </label>
            <Input
              id="display-name"
              dir="auto"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby="name-hint"
              aria-invalid={Boolean(error)}
            />
            <p id="name-hint" className="mt-1.5 text-sm text-muted-foreground">
              {t("settings.nameHint")}
            </p>
          </div>
          {error && <StatusBanner tone="danger">{error}</StatusBanner>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !changed}>
              {saving ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {t("settings.save")}
            </Button>
            {changed && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setName(original);
                  setError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </form>
        <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-muted-foreground">{t("auth.email")}</dt>
            <dd dir="ltr" translate="no" className="mt-1 truncate text-start">
              {user.email}
            </dd>
            <dd className="mt-1 text-sm text-muted-foreground">{t("settings.emailHint")}</dd>
          </div>
          {user.created_at && (
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">
                {t("settings.memberSinceLabel")}
              </dt>
              <dd className="mt-1">
                {formatDate(new Date(user.created_at), { dateStyle: "long" })}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="language" className="panel" data-tour="set-language">
        <h2 id="language" className="display flex items-center gap-2 text-2xl">
          <Languages className="h-5 w-5 text-primary" aria-hidden="true" />{" "}
          {t("settings.languageTitle")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("settings.languageBody")}</p>
        <LanguageSelector className="mt-4" />
      </section>

      <TourSettings />

      <section aria-labelledby="motion" className="panel" data-tour="set-motion">
        <h2 id="motion" className="display flex items-center gap-2 text-2xl">
          <Accessibility className="h-5 w-5 text-primary" aria-hidden="true" />{" "}
          {t("settings.motionTitle")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("settings.motionBody")}</p>
      </section>

      <section aria-labelledby="account" className="panel">
        <h2 id="account" className="display text-2xl">
          {t("settings.accountTitle")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("settings.signOutBody")}</p>
        <Button variant="outline" className="mt-4" onClick={signOut}>
          <LogOut className="rtl:rotate-180" aria-hidden="true" /> {t("nav.signOut")}
        </Button>
      </section>
    </PageEnter>
  );
}

/**
 * The guided tour: start it, resume where it was left, or play any one chapter. The status
 * says where the person left it; finished chapters are ticked.
 */
function TourSettings() {
  const { t } = useI18n();
  const { record, startFull, startPage } = useTour();
  const done = new Set(record?.chapters ?? []);
  const status = !record
    ? t("tour.statusNone")
    : record.status === "completed"
      ? t("tour.statusCompleted")
      : record.status === "skipped"
        ? t("tour.statusSkipped")
        : t("guide.statusPaused", { done: done.size, total: CHAPTERS.length });
  const canResume = record?.status === "paused" && Boolean(record.stepId);
  return (
    <section aria-labelledby="tour-settings" className="panel" data-tour="set-tour">
      <h2 id="tour-settings" className="display flex items-center gap-2 text-2xl">
        <Compass className="h-5 w-5 text-primary" aria-hidden="true" /> {t("tour.settingsTitle")}
      </h2>
      <p className="mt-2 text-muted-foreground">{t("guide.settingsBody", { n: CHAPTERS.length })}</p>
      <p className="mt-3 text-[0.9375rem] font-medium" data-tour-status={record?.status ?? "none"}>
        {status}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => startFull()}>
          <Compass aria-hidden="true" /> {record ? t("tour.restart") : t("tour.start")}
        </Button>
        {canResume && (
          <Button variant="outline" onClick={() => startFull(record.stepId)} data-tour-resume>
            <Play className="rtl:rotate-180" aria-hidden="true" /> {t("guide.resume")}
          </Button>
        )}
      </div>
      <h3 className="mt-6 font-semibold">{t("guide.chaptersTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("guide.chaptersHelp")}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {CHAPTERS.map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => startPage(c.id)}
                data-chapter={c.id}
                data-done={done.has(c.id) ? "" : undefined}
                className="press flex min-h-12 w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-start hover:bg-accent"
              >
                <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 font-medium">{t(c.title)}</span>
                {done.has(c.id) && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">{t("guide.chapterDone")}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
