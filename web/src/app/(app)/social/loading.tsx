import { PageHeaderSkeleton, PageShell, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <PageShell fill>
      <PageHeaderSkeleton />
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4">
        <Skeleton className="h-8 w-full max-w-3xl" />
        <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
      </div>
    </PageShell>
  );
}
