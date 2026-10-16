"use client";

import { useRouter } from "next/navigation";

import { NoticeLine } from "@/components/email-verification/notice";
import { useResendLink } from "@/components/email-verification/use-resend-link";
import { primaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";
import { APP_HOME } from "@/config/routes";

/** "Send a new link", for a signed-in user whose verification link didn't work. */
export function SendNewLink({ email }: { email: string }) {
  const router = useRouter();
  const { resend, resending, notice } = useResendLink(email, () => router.push(APP_HOME));
  return (
    <div className="mt-6">
      <button type="button" onClick={resend} disabled={resending} className={primaryButton}>
        {COPY.sendNewLink}
      </button>
      <NoticeLine notice={notice} className="mt-3 text-sm" />
    </div>
  );
}
