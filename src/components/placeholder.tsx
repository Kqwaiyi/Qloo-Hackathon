/** A page that later tickets fill in. */
export function Placeholder({ title, children }: { title: string; children: string }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-stone-600">{children}</p>
    </>
  );
}
