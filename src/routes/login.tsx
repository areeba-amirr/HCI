import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { AuthFrame } from "@/components/app/AuthFrame";
import { StatusBanner } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>): { signup?: "success" } =>
    s.signup === "success" ? { signup: "success" } : {},
  head: () => ({
    meta: [
      { title: "Login — MediSnap" },
      { name: "description", content: "Sign in to your MediSnap account to scan medicines, read prescriptions in Urdu and review your health history." },
      { property: "og:title", content: "Login — MediSnap" },
      { property: "og:description", content: "Sign in to MediSnap to access your medicine scans, prescriptions and symptom diary." },
      { property: "og:url", content: "/login" },
    ],
    links: [{ rel: "canonical", href: "/login" }],
  }),

});

function LoginPage() {
  const navigate = useNavigate();
  const { t, tError } = useI18n();
  const { signup } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupSuccess, setShowSignupSuccess] = useState(signup === "success");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  useEffect(() => {
    if (signup !== "success") return;
    setShowSignupSuccess(true);
    const t = setTimeout(() => setShowSignupSuccess(false), 5000);
    return () => clearTimeout(t);
  }, [signup]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    toast.success(t("auth.welcomeToast"));
    navigate({ to: "/dashboard" });
  }

  return (
    <AuthFrame
      title={t("auth.welcomeBack")}
      subtitle={t("auth.signInSubtitle")}
      footer={
        <>
          {t("auth.newHere")}{" "}
          <Link to="/signup" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t("auth.createAnAccount")}
          </Link>
        </>
      }
    >
      {showSignupSuccess && (
        <div className="mb-5">
          <StatusBanner tone="success">{t("auth.signupSuccess")}</StatusBanner>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="field-label">{t("auth.email")}</label>
          <Input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="field-label">{t("auth.password")}</label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              dir="ltr"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pe-12"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              className="absolute end-0.5 top-0.5"
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
        </div>
        {error && <StatusBanner tone="danger">{tError(error)}</StatusBanner>}
        <Button size="lg" disabled={loading} type="submit" className="w-full">
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t("auth.signIn")}
        </Button>
      </form>
    </AuthFrame>
  );
}
