import Link from "next/link";

/** The Qurator wordmark (public/brand), one file per ground: drawn in ink and grey, or in paper and grey. */
export const WORDMARK_SRC = { paper: "/brand/qurator-wordmark.svg", ink: "/brand/qurator-wordmark-on-ink.svg" } as const;

/** Its intrinsic size. Its caps are 70.7 of its 115 units tall; its tag hangs below the baseline. */
export const WORDMARK_SIZE = { width: 527, height: 115 } as const;

/**
 * The wordmark linking home, for the app's own headers on white. It's 20 px tall with its caps
 * 12 px; nudged down 3.5 px, its caps rather than its hanging tag centre on the row.
 */
export function Wordmark({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      <img src={WORDMARK_SRC.paper} alt="Qurator" {...WORDMARK_SIZE} className="block h-5 w-auto translate-y-[3.5px]" />
    </Link>
  );
}
