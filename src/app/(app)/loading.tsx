export default function Loading() {
  return (
    <div role="status" aria-label="Loading workspace" className="space-y-8">
      <span className="sr-only">Loading your workspace...</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="workspace-skeleton h-3 w-24" />
        <div className="workspace-skeleton h-9 w-2/3 max-w-sm" />
        <div className="workspace-skeleton h-4 w-4/5 max-w-lg" />
      </div>
      <div aria-hidden="true" className="grid gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map(n => <div key={n} className="workspace-panel space-y-5 p-6"><div className="workspace-skeleton h-6 w-1/3" /><div className="workspace-skeleton h-16" /><div className="workspace-skeleton h-12" /><div className="workspace-skeleton h-12" /></div>)}
      </div>
    </div>
  );
}
