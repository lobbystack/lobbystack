"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

import { writeThemeCookie } from "@/lib/theme-cookie";

export { useTheme } from "next-themes";

function ThemeCookieSync() {
  const { theme } = useTheme();
  React.useEffect(() => {
    if (theme) writeThemeCookie(theme);
  }, [theme]);
  return null;
}

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}><ThemeCookieSync />{children}</NextThemesProvider>;
}
