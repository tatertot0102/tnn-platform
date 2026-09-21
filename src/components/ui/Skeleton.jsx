// Placeholder blocks shown only on a page's first load; later visits render
// straight from cache.
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-gray-800/70 ${className}`} aria-hidden="true" />
}

export function ListSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-5 h-5" />
          <Skeleton className={`h-4 ${i % 3 === 0 ? 'w-2/3' : i % 3 === 1 ? 'w-1/2' : 'w-3/5'}`} />
          <Skeleton className="h-4 w-20 ml-auto hidden md:block" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-32" />
      <div className="card p-6 space-y-3">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="card p-6"><ListSkeleton /></div>
    </div>
  )
}
