export const Skeleton = ({ className = "h-4 w-full" }) => (
  <div className={`skeleton ${className}`} />
);

export const SkeletonCard = () => (
  <div className="card-base p-5 space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="w-12 h-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
    <Skeleton className="h-32 w-full rounded-xl" />
    <div className="space-y-2">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  </div>
);

export const SkeletonRow = ({ cols = 4 }) => (
  <div className="flex gap-4 items-center py-3">
    {Array.from({ length: cols }).map((_, i) => (
      <Skeleton key={i} className="h-4 flex-1" />
    ))}
  </div>
);

export default Skeleton;
