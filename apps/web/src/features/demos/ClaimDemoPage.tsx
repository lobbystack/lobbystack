import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedMutation } from "@/lib/observed-convex";
import {
  clearStoredProspectDemoToken,
  getStoredProspectDemoToken,
} from "@/lib/prospect-demo-token";

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

export function ClaimDemoPage() {
  const { t } = useTranslation("demos");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token =
    searchParams.get("token")?.trim() || getStoredProspectDemoToken() || "";
  const claimProspectDemo = useObservedMutation(api.demos.claimProspectDemo);
  const preview = useQuery(
    api.demos.previewProspectDemo,
    token ? { token } : "skip",
  );
  const [status, setStatus] = useState<ClaimStatus>(
    token ? "claiming" : "unavailable",
  );
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

    const prospectDemoId = String(preview.demoId);
    const campaignId = preview.campaignId;
    if (claimAttemptRef.current?.token !== token) {
      claimAttemptRef.current = {
        token,
        promise: claimProspectDemo({ token }),
      };
    }
    const claimPromise = claimAttemptRef.current.promise;

    let cancelled = false;
    void claimPromise
      .then(() => {
        if (cancelled) {
          return;
        }
        captureAnalyticsEvent("web.prospect_demo.claim_succeeded", {
          prospectDemoId,
          ...(campaignId !== null ? { campaignId } : {}),
        });
        clearStoredProspectDemoToken();
        navigate("/onboarding/business", { replace: true });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        captureAnalyticsEvent("web.prospect_demo.claim_failed", {
          prospectDemoId,
          ...(campaignId !== null ? { campaignId } : {}),
        });
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
  }, [attempt, claimProspectDemo, navigate, preview, token]);

  if (status === "unavailable") {
    return (
      <ClaimShell
        description={t("claim.unavailableDescription")}
        title={t("claim.unavailableTitle")}
      />
    );
  }

  if (status === "error") {
    return (
      <ClaimShell
        description={t("claim.errorDescription")}
        title={t("claim.errorTitle")}
      >
        <Button
          className="h-11 w-full"
          onClick={() => {
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
