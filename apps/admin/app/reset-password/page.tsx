"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { PasswordResetForm } from "@/components/password-reset-form";


function ResetPasswordFormFromQuery() {
  const searchParams = useSearchParams();
  return <PasswordResetForm token={searchParams.get("token")} />;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordFormFromQuery /></Suspense>;
}
