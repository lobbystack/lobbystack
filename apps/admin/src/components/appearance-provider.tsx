import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useTranslation } from "react-i18next";

import {
  readStoredTimeFormatPreference,
  resolveTimeFormatPreference,
  writeStoredTimeFormatPreference,
  type TimeFormatPreference,
} from "@/lib/locale";

type AppearanceContextValue = {
  /** False until the stored choice has been read, which only the browser can do. */
  ready: boolean;
  timeFormatPreference: TimeFormatPreference;
  setTimeFormatPreference: (value: TimeFormatPreference) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  // Read after mount: the server can't see localStorage, so the first render uses the locale's default.
  const [storedPreference, setStoredPreference] = useState<TimeFormatPreference | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setStoredPreference(readStoredTimeFormatPreference()); setReady(true); }, []);
  const timeFormatPreference = resolveTimeFormatPreference({
    storedPreference,
    locale: i18n.resolvedLanguage ?? i18n.language,
  });

  const value = useMemo<AppearanceContextValue>(
    () => ({
      ready,
      timeFormatPreference,
      setTimeFormatPreference: (nextValue) => {
        setStoredPreference(nextValue);
        writeStoredTimeFormatPreference(nextValue);
      },
    }),
    [ready, timeFormatPreference],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearancePreference(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error(
      "useAppearancePreference must be used within an AppearanceProvider.",
    );
  }

  return context;
}

/** The time format preference, or null outside an AppearanceProvider. */
export function useTimeFormatPreference(): TimeFormatPreference | null {
  return useContext(AppearanceContext)?.timeFormatPreference ?? null;
}
