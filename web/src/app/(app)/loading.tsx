// Shown the instant a nav link is tapped, while the page's own queries run.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="bg-surface-sunken rounded-card h-8 w-1/3 animate-pulse" />
      <div className="bg-surface-sunken rounded-card aspect-[4/3] w-full animate-pulse" />
      <div className="bg-surface-sunken rounded-card h-24 w-full animate-pulse" />
    </div>
  );
}
