import { PasswordResetForm } from "@/components/password-reset-form";

export default async function ResetPasswordTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PasswordResetForm token={token} />;
}
