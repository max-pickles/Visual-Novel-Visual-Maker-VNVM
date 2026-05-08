import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { en } from './locales/en';
import { es } from './locales/es';
import { ja } from './locales/ja';

type Dictionary = typeof en;

const dictionaries: Record<string, Dictionary> = {
  en,
  es,
  ja
};

interface TranslationContextType {
  language: string;
  t: (keyPath: string) => string;
  gameTranslations: Record<string, Record<string, string>>;
  setGameTranslations: (dict: Record<string, Record<string, string>>) => void;
}

const TranslationContext: React.Context<TranslationContextType | null> = 
  (globalThis as any).__VNV_TranslationContext || createContext<TranslationContextType | null>(null);
(globalThis as any).__VNV_TranslationContext = TranslationContext;

export function TranslationProvider({ language, children }: { language: string; children: ReactNode }) {
  const [gameTranslations, setGameTranslations] = useState<Record<string, Record<string, string>>>({});

  const dict = dictionaries[language] || dictionaries['en'];

  const t = (keyPath: string): string => {
    const keys = keyPath.split('.');
    let current: any = dict;
    for (const k of keys) {
      if (current[k] === undefined) {
        // Fallback to English if translation is missing
        let fallback: any = en;
        for (const fk of keys) {
          if (fallback[fk] === undefined) return keyPath;
          fallback = fallback[fk];
        }
        return fallback;
      }
      current = current[k];
    }
    return current;
  };

  return (
    <TranslationContext.Provider value={{ language, t, gameTranslations, setGameTranslations }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return ctx;
}
