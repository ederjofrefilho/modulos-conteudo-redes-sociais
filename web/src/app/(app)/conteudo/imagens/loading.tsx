import { PageHeaderSkeleton, PageShell, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <PageShell width="wide">
      <PageHeaderSkeleton />
      <div className="grid gap-8 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="aspect-[4/5] w-full rounded-xl" />
      </div>
    </PageShell>
  );
}
