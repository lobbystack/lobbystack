"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function useAuthActions() {
  const router = useRouter();

  const signOut = useCallback(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
    router.push("/login");
    router.refresh();
  }, [router]);

  const signIn = useCallback(
    async (provider: string, params: Record<string, FormDataEntryValue>) => {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: params.email,
          password: params.password,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Invalid credentials");
      }

      router.refresh();
    },
    [router],
  );

  return { signIn, signOut };
}
