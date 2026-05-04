import { useState } from "react";

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Globe, LoaderCircle, LogOut } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { captureAnalyticsEvent } from "@/lib/analytics";

type OnboardingWebsitePageProps = {
  businessId: Id<"businesses">;
  currentUserEmail?: string;
  onSignOut: () => void;
};

export function OnboardingWebsitePage({
  businessId,
  currentUserEmail,
  onSignOut,
}: OnboardingWebsitePageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const submitOnboardingWebsite = useObservedAction(api.onboarding.websites.submitOnboardingWebsite);
  const skipOnboardingWebsite = useObservedMutation(api.onboarding.websites.skipOnboardingWebsite);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!websiteUrl.trim()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await submitOnboardingWebsite({
        businessId,
        websiteUrl: websiteUrl.trim(),
      });
      captureAnalyticsEvent("web.onboarding.website_submitted", {
        businessId: String(businessId),
      });
      void navigate("/onboarding/number");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("website.submitFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip(): Promise<void> {
    setIsSkipping(true);
    setError(null);
    try {
      await skipOnboardingWebsite({
        businessId,
      });
      captureAnalyticsEvent("web.onboarding.website_skipped", {
        businessId: String(businessId),
      });
      void navigate("/onboarding/number");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : t("website.skipFailed"),
      );
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(82,43,173,0.16),_transparent_36%),linear-gradient(180deg,_#120f1d_0%,_#09080d_100%)] text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl font-semibold tracking-tight">
            {import.meta.env.VITE_APP_NAME ?? "LobbyStack"}
          </div>
          <div className="flex items-center gap-3">
            {currentUserEmail ? (
              <span className="hidden text-sm text-zinc-400 sm:inline">
                {t("website.signedInAs", { email: currentUserEmail })}
              </span>
            ) : null}
            <Button
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onSignOut}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-xl border-white/10 bg-white/5 text-white shadow-2xl shadow-black/30 backdrop-blur">
            <CardHeader className="items-center text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-violet-500/15 text-violet-300 shadow-inner shadow-violet-950/40">
                <Globe className="size-9" />
              </div>
              <CardTitle className="text-4xl font-semibold tracking-tight">
                {t("website.title")}
              </CardTitle>
              <CardDescription className="type-section-description max-w-md text-zinc-300">
                {t("website.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="onboarding-website-url">
                    {t("website.fields.url")}
                  </FieldLabel>
                  <Input
                    autoComplete="url"
                    id="onboarding-website-url"
                    onChange={(event) => {
                      setWebsiteUrl(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSubmit();
                      }
                    }}
                    placeholder={t("website.placeholders.url")}
                    type="url"
                    value={websiteUrl}
                  />
                  <FieldDescription className="text-zinc-400">
                    {t("website.hint")}
                  </FieldDescription>
                </Field>
              </FieldGroup>

              {error ? <FieldError>{error}</FieldError> : null}

              <div className="flex flex-col gap-3">
                <Button
                  className="h-12 bg-violet-500 text-base font-medium text-white hover:bg-violet-400"
                  disabled={isSubmitting || isSkipping || websiteUrl.trim().length === 0}
                  onClick={() => void handleSubmit()}
                  type="button"
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      {t("website.submitting")}
                    </>
                  ) : (
                    t("website.submit")
                  )}
                </Button>
                <Button
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                  disabled={isSubmitting || isSkipping}
                  onClick={() => void handleSkip()}
                  type="button"
                  variant="outline"
                >
                  {isSkipping ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      {t("website.skipping")}
                    </>
                  ) : (
                    t("website.skip")
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
