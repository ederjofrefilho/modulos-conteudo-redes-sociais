import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <Skeleton className="mb-2 h-3.5 w-24" />
      <Skeleton className="mb-8 h-6 w-72" />
      <div className="flex flex-col gap-8">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
