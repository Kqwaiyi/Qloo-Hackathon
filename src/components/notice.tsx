/** A line saying how an action went: read out at once, as an alert when it's a problem. */
export interface Notice {
  text: string;
  problem: boolean;
}

export function NoticeLine({ notice, className = "" }: { notice: Notice | null; className?: string }) {
  if (!notice) return null;
  return (
    <p role={notice.problem ? "alert" : "status"} className={`${className} ${notice.problem ? "text-red-700" : "text-stone-700"}`}>
      {notice.text}
    </p>
  );
}
