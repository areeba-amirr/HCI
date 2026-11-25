// Interface languages: each one needs a complete, hand-written catalog bundled with the app
// (see I18nProvider). Everything else (selector, RTL handling, date formatting) is derived
// from this list.
export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", locale: "en-US" },
  { code: "ur", name: "Urdu", nativeName: "اردو", dir: "rtl", locale: "ur-PK" },
] as const;

export type Language = (typeof LANGUAGES)[number];
export type LanguageCode = Language["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const LANGUAGE_STORAGE_KEY = "medisnap.language";

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

export function getLanguage(code: LanguageCode): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

// Runs before first paint so a returning Urdu/Arabic user never sees the English
// LTR page flash. I18nProvider removes the class once the catalog is applied;
// the timeout is a failsafe so the page can never stay hidden.
export const LANGUAGE_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)});var l=${JSON.stringify(
  LANGUAGES.map((l) => [l.code, l.dir]),
)}.filter(function(x){return x[0]===c})[0];if(l&&c!==${JSON.stringify(DEFAULT_LANGUAGE)}){var d=document.documentElement;d.lang=c;d.dir=l[1];d.classList.add("i18n-pending");setTimeout(function(){d.classList.remove("i18n-pending")},25000)}}catch(e){}})();`;
