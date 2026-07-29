function SkeletonCard({ wide = false }: { wide?: boolean }) {
  return (
    <div className={wide ? "h-32 animate-pulse rounded-[22px] border border-white/[0.08] bg-white/[0.035]" : "h-40 animate-pulse rounded-[22px] border border-white/[0.08] bg-white/[0.035]"} />
  );
}

export default function DashboardLoading() {
  return (
    <div className="page-shell mx-auto max-w-6xl space-y-3 pb-28 md:space-y-5 md:pb-8">
      <SkeletonCard wide />
      <div className="grid gap-3 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
