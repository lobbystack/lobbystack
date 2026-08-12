import { PasswordResetForm } from "@/components/password-reset-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ResetPasswordTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><Card className="w-full max-w-md"><CardHeader><CardTitle>Choose a new password</CardTitle><CardDescription className="mt-2">Your new password will protect this LobbyStack account.</CardDescription></CardHeader><CardContent><PasswordResetForm token={token} /></CardContent></Card></main>;
}
