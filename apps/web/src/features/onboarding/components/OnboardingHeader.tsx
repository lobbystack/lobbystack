import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

type OnboardingHeaderProps = {
  /** Optional handler for a "Sign out" affordance shown only when authenticated. */
  onSignOut?: () => void;
};

/**
 * Top of every onboarding/auth screen: a centred LobbyStack wordmark.
 *
 * When `onSignOut` is provided we render a tiny right-aligned text link so
 * users who are mid-onboarding can drop out without hunting for it.
 */
export function OnboardingHeader({ onSignOut }: OnboardingHeaderProps) {
  const { t } = useTranslation("onboarding");

  return (
    <header className="relative flex w-full items-center justify-center pt-16 pb-8">
      <img
        alt="LobbyStack"
        className="h-7 w-auto select-none"
        draggable={false}
        src="/brand/logo-wordmark.svg"
      />
      {onSignOut ? (
        <div className="absolute right-6 top-16 flex items-center sm:right-8">
          <Button
            className="text-muted-foreground hover:text-foreground"
            onClick={onSignOut}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("shell.signOut")}
          </Button>
        </div>
      ) : null}
    </header>
  );
}
