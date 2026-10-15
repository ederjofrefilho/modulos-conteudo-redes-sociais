import { PageHeaderSkeleton, PageShell, Skeleton, TableSkeleton } from '@/components/ui';

export default function Loading() {
  return (
    <PageShell fill>
      <PageHeaderSkeleton />
      <div className="min-h-0 flex-1 overflow-auto pb-8">
        <TableSkeleton />
      </div>
    </PageShell>
  );
}
