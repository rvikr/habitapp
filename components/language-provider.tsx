import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getItem, setItem } from "@/lib/platform/storage";
import {
  isSupportedLanguage,
  languageLabel,
  translate,
  type Language,
} from "@/lib/i18n/translations";

const STORAGE_KEY = "habbit:language";

type LanguageContextValue = {
  language: Language;
  languageName: string;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (message: string, values?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  languageName: languageLabel("en"),
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (message, values) => translate("en", message, values),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    getItem(STORAGE_KEY).then((saved: string | null) => {
      if (isSupportedLanguage(saved)) setLanguageState(saved);
    });
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    setItem(STORAGE_KEY, next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "hi" : "en");
  }, [language, setLanguage]);

  const t = useCallback(
    (message: string, values?: Record<string, string | number>) =>
      translate(language, message, values),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      languageName: languageLabel(language),
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language, setLanguage, toggleLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
