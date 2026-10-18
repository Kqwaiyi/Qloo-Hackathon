import Link from "next/link";
import type { ReactNode } from "react";

// The landing page's building blocks. One typeface at four sizes (display, title, body, label),
// black, white and two greys. A `tone` says which ground a block sits on: paper (light) or ink (dark).

export type Tone = "paper" | "ink";

/** Small, uppercase and tracked: chapter numbers, chips, hotspots, captions and buttons. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`text-label font-medium uppercase ${className}`}>{children}</span>;
}

/**
 * A headline in two parts pushed to the edges of the page, with an optional label under it,
 * centred. On narrower screens the parts stack, the second one right-aligned. Screen readers hear
 * the parts joined into one heading, with the joiner between them.
 */
export function SpreadHeadline({
  as: Tag = "h2",
  id,
  left,
  right,
  joiner = " ",
  gap,
  className = "",
}: {
  as?: "h1" | "h2";
  id?: string;
  left: string;
  right: string;
  joiner?: string;
  gap?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 md:px-6 ${className}`}>
      {/* Its name is spelled out: split into masked lines, the parts would otherwise be heard with stray spaces. */}
      <Tag
        id={id}
        aria-label={`${left}${joiner}${right}`}
        className="flex flex-col text-display font-normal uppercase xl:flex-row xl:items-baseline xl:justify-between"
      >
        <span data-reveal="rise" className="block">
          {left}
        </span>
        <span data-reveal="rise" className="block self-end text-right xl:self-auto">
          {right}
        </span>
      </Tag>
      {gap && (
        <p data-reveal="blur" className="mt-6 max-w-[26ch] text-label font-medium uppercase xl:mx-auto xl:mt-8 xl:text-center">
          {gap}
        </p>
      )}
    </div>
  );
}

/** Who does a step, per ADR-0001, told apart by shape rather than colour: Qloo filled, AI outlined, You dotted. */
export type Who = "Qloo" | "AI" | "You";

const WHO_SHAPES: Record<Who, string> = {
  Qloo: "bg-current",
  AI: "border border-current",
  You: "border border-dashed border-current",
};

export function WhoTag({ who, tone }: { who: Who; tone: Tone }) {
  const filledText = tone === "paper" ? "text-paper" : "text-ink";
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 ${WHO_SHAPES[who]}`}>
      <Label className={who === "Qloo" ? filledText : ""}>{who}</Label>
    </span>
  );
}

/** A chapter's number and who does it: "03 / 07" and a Who tag. */
export function ChapterTag({ number, who, tone }: { number: number; who: Who; tone: Tone }) {
  return (
    <p data-reveal="blur" className="flex items-center gap-3">
      <Label>
        {String(number).padStart(2, "0")} / {String(CHAPTER_COUNT).padStart(2, "0")}
      </Label>
      <WhoTag who={who} tone={tone} />
    </p>
  );
}

/** The walkthrough's numbered chapters, from the photo to the Outfit. */
export const CHAPTER_COUNT = 7;

/** A word or two on a pill: Photo Style words, profile details, a Budget Tier. */
export function Chip({ children, tone }: { children: ReactNode; tone: Tone }) {
  const surface = tone === "paper" ? "bg-card text-ink" : "bg-card-dark text-paper ring-1 ring-paper/10";
  return <Label className={`inline-flex h-7 items-center rounded-full px-3 ${surface}`}>{children}</Label>;
}

/** A pill-shaped link: solid for the main action, glass for one that floats over anything. */
export function Pill({
  href,
  children,
  variant,
  tone = "paper",
  glyph,
  className = "",
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant: "solid" | "glass" | "ghost";
  tone?: Tone;
  glyph?: "+" | "↗" | "↓";
  className?: string;
  "aria-label"?: string;
  "data-scroll-to"?: string;
}) {
  const looks = {
    solid: tone === "paper" ? "bg-ink text-paper hover:bg-ink/85" : "bg-paper text-ink hover:bg-paper/85",
    glass: "bg-ink/70 text-paper ring-1 ring-paper/12 backdrop-blur-md hover:bg-ink/90",
    ghost: tone === "paper" ? "ring-1 ring-ink/15 hover:bg-ink hover:text-paper" : "ring-1 ring-paper/20 hover:bg-paper hover:text-ink",
  }[variant];
  const content = (
    <>
      <Label className="whitespace-nowrap">{children}</Label>
      {glyph && (
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center text-sm transition-transform duration-300 ease-glide group-hover:rotate-90"
        >
          {/* U+FE0E keeps arrows plain glyphs, not emoji. */}
          {glyph === "+" ? "+" : `${glyph}︎`}
        </span>
      )}
    </>
  );
  const classes = `group inline-flex h-10 items-center gap-6 rounded-full pr-2 pl-4 transition-colors duration-300 ${looks} ${className}`;
  // An in-page link stays a plain anchor, so it works without script and the smooth scroll can take it over.
  if (href.startsWith("#")) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {content}
    </Link>
  );
}

/**
 * A hairline frame with a small square at each corner and at the middle of each side, the way an
 * engineering drawing frames its subject.
 */
export function GridFrame({ children, tone, className = "" }: { children: ReactNode; tone: Tone; className?: string }) {
  const line = tone === "paper" ? "border-ink/12" : "border-paper/14";
  const tick = tone === "paper" ? "bg-ink/40" : "bg-paper/40";
  const ticks = ["top-0 left-0", "top-0 left-1/2", "top-0 left-full", "top-1/2 left-0", "top-1/2 left-full", "top-full left-0", "top-full left-1/2", "top-full left-full"];
  return (
    <div className={`relative border ${line} ${className}`}>
      <div aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-1/2 border-l ${line}`} />
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-1/2 border-t ${line}`} />
      {ticks.map((at) => (
        <span key={at} aria-hidden="true" className={`pointer-events-none absolute size-[5px] -translate-x-1/2 -translate-y-1/2 ${tick} ${at}`} />
      ))}
      {children}
    </div>
  );
}

/**
 * A rendered loop, muted and decorative. It doesn't autoplay: the motion layer plays it while it's
 * on screen, and with reduced motion (or no script) it stays on its poster.
 */
export function LoopVideo({ name, className = "" }: { name: string; className?: string }) {
  return (
    <>
      <video
        data-loop
        muted
        loop
        playsInline
        preload="none"
        poster={`/landing/${name}.poster.webp`}
        aria-hidden="true"
        tabIndex={-1}
        className={`hidden h-full w-full object-cover md:block ${className}`}
      >
        <source src={`/landing/${name}.webm`} type="video/webm" />
        <source src={`/landing/${name}.mp4`} type="video/mp4" />
      </video>
      <video
        data-loop
        muted
        loop
        playsInline
        preload="none"
        poster={`/landing/${name}-m.poster.webp`}
        aria-hidden="true"
        tabIndex={-1}
        className={`h-full w-full object-cover md:hidden ${className}`}
      >
        <source src={`/landing/${name}-m.webm`} type="video/webm" />
        <source src={`/landing/${name}-m.mp4`} type="video/mp4" />
      </video>
    </>
  );
}
