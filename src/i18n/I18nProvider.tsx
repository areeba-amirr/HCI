import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  getLanguage,
  isLanguageCode,
  type LanguageCode,
} from "./languages";
import { en, type MessageKey, type Messages } from "./messages";
import { ur } from "./ur";
import { supabase } from "@/integrations/supabase/client";
import { LanguageWelcome } from "@/components/LanguageWelcome";

/**
 * Complete, hand-written catalogs shipped with the app: switching is instant and works
 * offline. Nothing is machine-translated at runtime.
 */
const BUNDLED: Record<LanguageCode, Partial<Messages>> = { en, ur };

/** The signed-in account's saved language, if any (kept in the Supabase profile). */
const ACCOUNT_KEY = "preferred_language";

type Params = Record<string, string | number>;

interface I18nContextValue {
  language: LanguageCode;
  dir: "ltr" | "rtl";
  setLanguage: (code: LanguageCode) => void;
  /** True until the person has a language (first launch shows the chooser). */
  choosingLanguage: boolean;
  t: (key: MessageKey, params?: Params) => string;
  /** Translates a known error message; unknown messages are returned unchanged. */
  tError: (message: string) => string;
  formatDate: (date: Date, options: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (date: Date) => string;
}

// localStorage can throw (private mode, blocked storage), so every access is guarded.
function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference simply won't persist */
  }
}

function applyDocumentLanguage(code: LanguageCode) {
  const root = document.documentElement;
  root.lang = code;
  root.dir = getLanguage(code).dir;
}

function revealPage() {
  document.documentElement.classList.remove("i18n-pending");
}

function interpolate(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

const errorKeys = new Map(
  Object.entries(en).map(([key, text]) => [text as string, key as MessageKey]),
);

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Always starts in English so the first client render matches the server HTML.
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [messages, setMessages] = useState<Messages>(en);
  const shownRef = useRef<{ language: LanguageCode; messages: Messages }>({
    language: DEFAULT_LANGUAGE,
    messages: en,
  });

  const show = useCallback((code: LanguageCode, catalog: Messages) => {
    shownRef.current = { language: code, messages: catalog };
    setLanguageState(code);
    setMessages(catalog);
    applyDocumentLanguage(code);
    revealPage();
  }, []);

  const load = useCallback(
    async (code: LanguageCode) => {
      show(code, { ...en, ...BUNDLED[code] });
      storageSet(LANGUAGE_STORAGE_KEY, code);
      return true;
    },
    [show],
  );

  /** Saves the language to the signed-in account, so it follows the person to other devices. */
  const saveToAccount = useCallback(async (code: LanguageCode) => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || user.user_metadata?.[ACCOUNT_KEY] === code) return;
      await supabase.auth.updateUser({ data: { [ACCOUNT_KEY]: code } });
    } catch {
      /* the choice still applies on this device */
    }
  }, []);

  const [choosing, setChoosing] = useState(false);

  // Runs before paint, while the boot script is still hiding the page.
  useLayoutEffect(() => {
    const stored = storageGet(LANGUAGE_STORAGE_KEY);
    if (isLanguageCode(stored) && stored !== DEFAULT_LANGUAGE) void load(stored);
    else revealPage();
    if (isLanguageCode(stored)) return;
    // First launch on this device: use the account's language if there is one, otherwise ask.
    // The question only opens once the (local) session check has found no saved choice, so a
    // returning user on a new device never sees it flash.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        const pref = data.session?.user?.user_metadata?.[ACCOUNT_KEY];
        if (isLanguageCode(pref)) void load(pref);
        else if (!isLanguageCode(storageGet(LANGUAGE_STORAGE_KEY))) setChoosing(true);
      })
      .catch(() => setChoosing(true));
  }, [load]);

  // Signing in: the account's language wins; an account without one takes this device's.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session?.user) return;
      const pref = session.user.user_metadata?.[ACCOUNT_KEY];
      if (isLanguageCode(pref)) {
        setChoosing(false);
        if (pref !== shownRef.current.language) void load(pref);
      } else if (isLanguageCode(storageGet(LANGUAGE_STORAGE_KEY))) {
        void saveToAccount(shownRef.current.language);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load, saveToAccount]);

  const choose = useCallback(
    async (code: LanguageCode) => {
      setChoosing(false);
      if (await load(code)) void saveToAccount(code);
    },
    [load, saveToAccount],
  );

  const value = useMemo<I18nContextValue>(() => {
    const locale = getLanguage(language).locale;
    // Latin digits and the Gregorian calendar everywhere, so medical dates read the same.
    const intlLocale = `${locale}-u-nu-latn-ca-gregory`;
    const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(intlLocale, options).format(date);
    return {
      language,
      dir: getLanguage(language).dir,
      setLanguage: (code) => void choose(code),
      choosingLanguage: choosing,
      t: (key, params) => interpolate(messages[key] ?? en[key], params),
      tError: (message) => {
        const key = errorKeys.get(message);
        return key ? messages[key] : message;
      },
      formatDate,
      formatDateTime: (date) =>
        `${formatDate(date, { dateStyle: "long" })} — ${formatDate(date, { timeStyle: "short" })}`,
    };
  }, [language, messages, choose, choosing]);

  return (
    <I18nContext.Provider value={value}>
      {children}
      {choosing && <LanguageWelcome onChoose={(code) => void choose(code)} />}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
