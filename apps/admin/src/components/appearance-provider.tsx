import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import i18n from "@/i18n";
import {
  readStoredTimeFormatPreference,
  resolveTimeFormatPreference,
  writeStoredTimeFormatPreference,
  type TimeFormatPreference,
} from "@/lib/locale";

type AppearanceContextValue = {
  timeFormatPreference: TimeFormatPreference;
  setTimeFormatPreference: (value: TimeFormatPreference) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [timeFormatPreference, setTimeFormatPreferenceState] =
    useState<TimeFormatPreference>(
      resolveTimeFormatPreference({
        storedPreference: readStoredTimeFormatPreference(),
        locale: i18n.resolvedLanguage ?? i18n.language,
      }),
    );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      timeFormatPreference,
      setTimeFormatPreference: (nextValue) => {
        setTimeFormatPreferenceState(nextValue);
        writeStoredTimeFormatPreference(nextValue);
      },
    }),
    [timeFormatPreference],
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
