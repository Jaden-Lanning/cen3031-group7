import { Target } from "lucide-react";

export function GoalSyncBrand() {
  return (
    <span className="inline-flex shrink-0 items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Target className="size-6" aria-hidden="true" />
      </span>
      <span className="text-xl font-bold tracking-tight">Goal Sync<span className="text-primary">.</span></span>
    </span>
  );
}
