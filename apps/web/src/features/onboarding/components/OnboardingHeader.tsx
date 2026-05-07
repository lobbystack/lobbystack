/**
 * Top of every onboarding/auth screen: a centred LobbyStack wordmark.
 */
export function OnboardingHeader() {
  return (
    <div className="flex w-full items-center justify-center">
      <img
        alt="LobbyStack"
        className="h-7 w-auto select-none"
        draggable={false}
        src="/brand/logo-wordmark.svg"
      />
    </div>
  );
}
