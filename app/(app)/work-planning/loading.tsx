function PlanSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "h-24 animate-pulse rounded-[20px] border border-white/[0.08] bg-white/[0.035]" : "h-44 animate-pulse rounded-[22px] border border-white/[0.08] bg-white/[0.035]"} />
  );
}

export default function WorkPlanningLoading() {
  return (
    <div className="page-shell max-w-full space-y-3 overflow-x-hidden pb-[180px] md:space-y-5 md:pb-8">
      <div className="space-y-2">
        <div className="h-7 w-52 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
      <PlanSkeleton />
      <div className="grid gap-3 md:grid-cols-3">
        <PlanSkeleton compact />
        <PlanSkeleton compact />
        <PlanSkeleton compact />
      </div>
      <PlanSkeleton />
    </div>
  );
}
