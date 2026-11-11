const storageKey = "lobbystack.onboarding.returnTo";

/** Notes the workspace the person was in when they started another, so onboarding can take them back. */
export function rememberOnboardingReturn(businessId: string | undefined): void {
  if (!businessId) return;
  try {
    window.sessionStorage.setItem(storageKey, businessId);
  } catch {
    // Without session storage, onboarding falls back to the most recent finished workspace.
  }
}

function rememberedReturn(): string | null {
  try {
    return window.sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

type Workspace = { businessId: string; active: boolean; onboardingStage?: string; createdAt?: string };

/**
 * The finished workspace onboarding's Back to dashboard opens: the one the
 * person came from, or else their most recently created finished one. Null
 * when they have no finished workspace but the one they're setting up, so
 * the header keeps Sign out only.
 */
export function onboardingReturnTarget(workspaces: readonly Workspace[] | undefined, remembered: string | null = rememberedReturn()): Workspace | null {
  const finished = (workspaces ?? []).filter((workspace) => workspace.onboardingStage === "complete");
  if (!finished.length) return null;
  return finished.find((workspace) => workspace.businessId === remembered)
    ?? finished.find((workspace) => workspace.active)
    ?? [...finished].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0]!;
}
