import Link from "next/link";

import { textLink } from "@/components/ui";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";

/** A reset link that has expired, been used, or been cancelled by another reset. */
export function BadResetLink() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{COPY.badLink}</h1>
      <p className="mt-6">
        <Link href={ROUTES.forgotPassword} className={textLink}>
          Ask for a new link
        </Link>
      </p>
    </>
  );
}
