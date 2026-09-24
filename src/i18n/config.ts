import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ar from "./locales/ar.json";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = ["ar", "fr", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_DIR: Record<SupportedLanguage, "rtl" | "ltr"> = {
  ar: "rtl",
  fr: "ltr",
  en: "ltr",
};

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        ar: { translation: ar },
        fr: { translation: fr },
        en: { translation: en },
      },
      fallbackLng: "ar",
      lng: typeof window === "undefined" ? "ar" : undefined,
      supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "htmlTag"],
        caches: ["localStorage"],
      },
    });
}

export function applyLanguageToDocument(lang: string) {
  if (typeof document === "undefined") return;
  const supported = (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)
    ? (lang as SupportedLanguage)
    : "ar";
  document.documentElement.lang = supported;
  document.documentElement.dir = LANGUAGE_DIR[supported];
}

export default i18n;
