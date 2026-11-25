import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { DEFAULT_LANGUAGE, LANGUAGE_BOOT_SCRIPT } from "@/i18n/languages";
import { MOTION_BOOT_SCRIPT } from "@/lib/motion-boot";

import appCss from "../styles.css?url";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&family=Hedvig+Letters+Serif:opsz@12..24&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="display text-8xl text-primary">404</p>
        <h1 className="display mt-4 text-3xl">{t("root.notFoundTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("root.notFoundBody")}</p>
        <Link to="/" className={`mt-6 ${buttonVariants()}`}>
          {t("root.goHome")}
        </Link>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t, tError } = useI18n();
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="display text-3xl">{t("root.errorTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{tError(error.message)}</p>
        <Button
          className="mt-6"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          {t("root.tryAgain")}
        </Button>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // MediSnap translates itself; browser auto-translate could alter medical data.
      { name: "google", content: "notranslate" },
      { name: "theme-color", content: "#4b2e83" },
      { title: "MediSnap — Snap. Understand. Stay Safe." },
      { name: "description", content: "Understand English medicine labels & doctor prescriptions in Urdu. Track symptoms and generate doctor reports." },
      { property: "og:title", content: "MediSnap — Snap. Understand. Stay Safe." },
      { property: "og:description", content: "Understand English medicine labels & doctor prescriptions in Urdu. Track symptoms and generate doctor reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "MediSnap — Snap. Understand. Stay Safe." },
      { name: "twitter:description", content: "Understand English medicine labels & doctor prescriptions in Urdu. Track symptoms and generate doctor reports." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fa2e198d-c6fe-4bc0-b5f6-b18d45e475be/id-preview-4a99f6ad--a4d5085c-8d09-4990-8ef6-6bf16dd5d96a.lovable.app-1778577255291.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fa2e198d-c6fe-4bc0-b5f6-b18d45e475be/id-preview-4a99f6ad--a4d5085c-8d09-4990-8ef6-6bf16dd5d96a.lovable.app-1778577255291.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function SkipLink() {
  const { t } = useI18n();
  return (
    <a href="#main" className="skip-link">
      {t("root.skipToContent")}
    </a>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang={DEFAULT_LANGUAGE} dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANGUAGE_BOOT_SCRIPT + MOTION_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <I18nProvider>
          <SkipLink />
          {children}
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { dir } = useI18n();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors dir={dir} position={dir === "rtl" ? "top-left" : "top-right"} />
    </QueryClientProvider>
  );
}
