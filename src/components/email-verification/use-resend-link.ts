"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ROUTES } from "@/config/routes";

import { resendVerificationAction } from "./actions";
import { resendProblem } from "./messages";
import type { Notice } from "./notice";

/**
 * Sends the signed-in user a new verification link, with the notice that says how it went. A user
 * who has verified meanwhile goes wherever `onAlreadyVerified` takes them.
 */
export function useResendLink(email: string, onAlreadyVerified: () => void) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resending, startResending] = useTransition();

  function resend() {
    setNotice(null);
    startResending(async () => {
      const result = await resendVerificationAction();
      if (result.ok) setNotice({ text: `We sent a new link to ${email}.`, problem: false });
      else if (result.refusal === "signed-out") router.push(ROUTES.signIn);
      else if (result.refusal === "already-verified") onAlreadyVerified();
      else setNotice({ text: resendProblem(result.refusal), problem: true });
    });
  }

  return { resend, resending, notice, setNotice };
}
