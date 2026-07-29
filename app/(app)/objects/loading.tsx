function ObjectSkeleton() {
  return <div className="h-28 animate-pulse rounded-[20px] border border-white/[0.08] bg-white/[0.035]" />;
}

export default function ObjectsLoading() {
  return (
    <div className="page-shell space-y-3 pb-28 md:space-y-5 md:pb-8">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-xl bg-white/[0.04]" />
      </div>
      <div className="h-12 animate-pulse rounded-[18px] border border-white/[0.08] bg-white/[0.035]" />
      <ObjectSkeleton />
      <ObjectSkeleton />
      <ObjectSkeleton />
    </div>
  );
}
