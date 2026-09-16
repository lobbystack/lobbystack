"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/request-json";

type Preview = { state: "active" | "claimed" | "preparing" | "invalid" | "expired" | "revoked" };

type ClaimStatus = "claiming" | "unavailable" | "error";

function ClaimShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-md rounded-xl border bg-muted/30 p-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </div>
  );
}

export function ClaimDemoSurface() {
  const { t } = useTranslation("demos");
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus>("claiming");
  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const value = fragment.get("prospect_demo_token")?.trim() || url.searchParams.get("token")?.trim() || window.sessionStorage.getItem("prospect_demo_token") || "";
    if (value) window.sessionStorage.setItem("prospect_demo_token", value);
    url.searchParams.delete("token");
    fragment.delete("prospect_demo_token");
    url.hash = fragment.toString();
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    setToken(value);
    if (!value) setStatus("unavailable");
  }, []);
  const previewQuery = useQuery({
    queryKey: ["prospect-demo-preview", token],
    enabled: Boolean(token),
    queryFn: () => requestJson<Preview>("/api/demo/preview", { method: "POST", body: JSON.stringify({ token }) }),
    retry: false,
    refetchInterval: query => query.state.data?.state === "preparing" ? 1500 : false,
  });
  const preview = previewQuery.data;
  const [attempt, setAttempt] = useState(0);
  const claimAttemptRef = useRef<{
    token: string;
    promise: Promise<unknown>;
  } | null>(null);

  useEffect(() => {
    if (!token || preview === undefined) {
      return;
    }
    // Active demos claim normally. Claimed demos still call the mutation so the
    // original claimant can take the idempotent already_claimed path.
    if (preview.state !== "active" && preview.state !== "claimed") {
      if (preview.state !== "preparing") {
        setStatus("unavailable");
      }
      return;
    }

    if (claimAttemptRef.current?.token !== token) {
      claimAttemptRef.current = {
        token,
        promise: fetch("/api/demo/claim", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).then(async response => {
          if (response.status === 401) {
            return "authentication-required";
          }
          if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Claim failed.");
          return await response.json();
        }),
      };
    }
    const claimPromise = claimAttemptRef.current.promise;

    let cancelled = false;
    void claimPromise
      .then(result => {
        if (cancelled) {
          return;
        }
        if (result === "authentication-required") {
          router.replace(`/login?returnTo=${encodeURIComponent("/claim-demo")}`);
          return;
        }
        window.sessionStorage.removeItem("prospect_demo_token");
        router.replace("/onboarding/business");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "";
        if (
          preview.state === "claimed" ||
          message.includes("already been claimed")
        ) {
          setStatus("unavailable");
          return;
        }
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, router, preview, token]);

  if (status === "unavailable") {
    return (
      <ClaimShell
        description={t("claim.unavailableDescription")}
        title={t("claim.unavailableTitle")}
      />
    );
  }

  if (status === "error" || previewQuery.isError) {
    return (
      <ClaimShell
        description={t("claim.errorDescription")}
        title={t("claim.errorTitle")}
      >
        <Button
          className="h-11 w-full"
          onClick={() => {
            if (previewQuery.isError) void previewQuery.refetch();
            claimAttemptRef.current = null;
            setStatus("claiming");
            setAttempt((value) => value + 1);
          }}
          type="button"
        >
          {t("claim.retry")}
        </Button>
      </ClaimShell>
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="flex flex-col items-center gap-4 text-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t("claim.loadingTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("claim.loadingDescription")}
          </p>
        </div>
      </div>
    </div>
  );
}
