export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border-l-4 border-cac-blue bg-white p-4 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-8 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg border border-[#E2E8F0] bg-white" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
