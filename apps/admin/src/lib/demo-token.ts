export function secureDemoRedirect(token: string): string {
  return `/demo#${new URLSearchParams({ prospect_demo_token: token }).toString()}`;
}
