"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const AppLanguageContext = createContext(null);

const LANGUAGE_MODE_STORAGE_KEY = "app_language_mode_v1";
const LANGUAGE_MANUAL_STORAGE_KEY = "app_language_manual_v1";
const SUPPORTED_LANGUAGES = ["en", "pt-BR"];

function normalizeLanguage(value) {
  if (!value || typeof value !== "string") return "en";
  const normalized = value.trim();
  if (normalized.toLowerCase().startsWith("pt")) return "pt-BR";
  return "en";
}

function detectBrowserLanguage() {
  if (typeof window === "undefined") return "en";
  const fromLanguages = Array.isArray(window.navigator.languages) ? window.navigator.languages : [];
  const candidates = [...fromLanguages, window.navigator.language].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
  }
  return "en";
}

export function AppLanguageProvider({ children }) {
  const [languageMode, setLanguageMode] = useState(() => {
    if (typeof window === "undefined") return "auto";
    const savedMode = window.localStorage.getItem(LANGUAGE_MODE_STORAGE_KEY);
    return savedMode === "manual" ? "manual" : "auto";
  });
  const [manualLanguage, setManualLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_MANUAL_STORAGE_KEY) || "en");
  });
  const [detectedLanguage, setDetectedLanguage] = useState(() => detectBrowserLanguage());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onLanguageChange = () => {
      setDetectedLanguage(detectBrowserLanguage());
    };
    window.addEventListener("languagechange", onLanguageChange);
    return () => window.removeEventListener("languagechange", onLanguageChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LANGUAGE_MODE_STORAGE_KEY, languageMode);
    window.localStorage.setItem(LANGUAGE_MANUAL_STORAGE_KEY, manualLanguage);
  }, [languageMode, manualLanguage]);

  const locale = languageMode === "auto" ? detectedLanguage : manualLanguage;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
  }, [locale]);

  const setMode = useCallback((nextMode) => {
    if (nextMode !== "auto" && nextMode !== "manual") return;
    setLanguageMode(nextMode);
  }, []);

  const setManualLocale = useCallback((nextLanguage) => {
    setManualLanguage(normalizeLanguage(nextLanguage));
  }, []);

  const tr = useCallback((englishText, portugueseBrazilText) => (
    locale === "pt-BR" ? portugueseBrazilText : englishText
  ), [locale]);

  const value = useMemo(() => ({
    locale,
    detectedLocale: detectedLanguage,
    languageMode,
    manualLocale: manualLanguage,
    setMode,
    setManualLocale,
    tr,
  }), [detectedLanguage, languageMode, locale, manualLanguage, setManualLocale, setMode, tr]);

  return (
    <AppLanguageContext.Provider value={value}>
      {children}
    </AppLanguageContext.Provider>
  );
}

export function useAppLanguage() {
  const context = useContext(AppLanguageContext);
  if (!context) {
    throw new Error("useAppLanguage must be used inside AppLanguageProvider.");
  }
  return context;
}
