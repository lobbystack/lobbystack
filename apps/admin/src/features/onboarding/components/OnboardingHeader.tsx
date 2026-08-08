export function OnboardingHeader() {
  return (
    <div
      aria-label="LobbyStack"
      className="flex w-full items-center justify-center gap-2.5"
    >
      <img
        alt=""
        aria-hidden="true"
        className="size-6 select-none dark:invert"
        draggable={false}
        src="/brand/logo-icon.svg"
      />
      <span className="font-heading text-xl font-semibold leading-none text-foreground">
        LobbyStack
      </span>
    </div>
  );
}
