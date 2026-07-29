function TicketSkeleton() {
  return (
    <div className="h-32 animate-pulse rounded-[20px] border border-white/[0.08] bg-white/[0.035]" />
  );
}

export default function TicketsLoading() {
  return (
    <div className="page-shell max-w-full space-y-3 overflow-x-hidden pb-28 md:space-y-5 md:pb-8">
      <div className="space-y-2">
        <div className="h-7 w-36 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
      <div className="h-10 animate-pulse rounded-[14px] bg-white/[0.055]" />
      <div className="h-11 animate-pulse rounded-[14px] border border-white/[0.08] bg-white/[0.035]" />
      <TicketSkeleton />
      <TicketSkeleton />
      <TicketSkeleton />
    </div>
  );
}
