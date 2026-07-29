function DetailSkeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[22px] border border-white/[0.08] bg-white/[0.035] ${className}`} />;
}

export default function TicketDetailLoading() {
  return (
    <div className="page-shell space-y-3 pb-32 md:space-y-5 md:pb-10">
      <DetailSkeleton className="h-36" />
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <div className="space-y-3 md:space-y-5">
          <DetailSkeleton className="h-44" />
          <DetailSkeleton className="h-36" />
          <DetailSkeleton className="h-28" />
        </div>
        <div className="space-y-3 md:space-y-5">
          <DetailSkeleton className="h-32" />
          <DetailSkeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}
