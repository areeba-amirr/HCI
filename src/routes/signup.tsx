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
import { en } from "@/i18n/messages";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "Sign up — MediSnap" },
      { name: "description", content: "Create a free MediSnap account to scan medicine labels, decode prescriptions in Urdu and track your daily symptoms." },
      { property: "og:title", content: "Sign up — MediSnap" },
      { property: "og:description", content: "Create a free MediSnap account and start understanding your medicines in Urdu today." },
      { property: "og:url", content: "/signup" },
    ],
    links: [{ rel: "canonical", href: "/signup" }],
  }),

});

function SignupPage() {
  const navigate = useNavigate();
  const { t, tError } = useI18n();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(en["auth.passwordMismatch"]);
      return;
    }
    if (password.length < 6) {
      setError(en["auth.passwordShort"]);
      return;
    }

    setLoading(true);
    const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { signup: "success" } });
  }

  return (
    <AuthFrame
      title={t("auth.createTitle")}
      subtitle={t("auth.createSubtitle")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t("auth.login")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="field-label">{t("auth.fullName")}</label>
          <Input id="name" type="text" autoComplete="name" dir="auto" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pe-12"
              aria-describedby="password-hint"
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
          <p id="password-hint" className="mt-1.5 text-sm text-muted-foreground">{t("auth.passwordShort")}</p>
        </div>
        <div>
          <label htmlFor="confirm" className="field-label">{t("auth.confirmPassword")}</label>
          <Input
            id="confirm"
            type={showPassword ? "text" : "password"}
            dir="ltr"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && <StatusBanner tone="danger">{tError(error)}</StatusBanner>}
        <Button size="lg" disabled={loading} type="submit" className="w-full">
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t("auth.createButton")}
        </Button>
      </form>
    </AuthFrame>
  );
}
