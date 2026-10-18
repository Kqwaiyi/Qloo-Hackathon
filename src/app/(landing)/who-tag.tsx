// Who decides what, per ADR-0001: Qloo decides what is recommended, the AI makes it concrete, and
// the user takes the photo and gets the Outfit.

export type Who = "Qloo" | "AI" | "You";

const WHO_STYLES: Record<Who, string> = {
  Qloo: "bg-violet-100 text-violet-800 ring-violet-200",
  AI: "bg-amber-100 text-amber-900 ring-amber-200",
  You: "bg-stone-200 text-stone-700 ring-stone-300",
};

export function WhoTag({ who }: { who: Who }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ${WHO_STYLES[who]}`}>
      {who}
    </span>
  );
}
