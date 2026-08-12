import { redirect } from "next/navigation";

export default async function ConfirmEmailChangePage({ searchParams }: { searchParams: Promise<{ token?: string; callbackURL?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.token) query.set("token", params.token);
  if (params.callbackURL) query.set("callbackURL", params.callbackURL);
  redirect(`/verify-email?${query.toString()}`);
}
