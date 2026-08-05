import { Inbox } from "lucide-react";

/** One shared empty-state for dashboard widgets — see docs/UI_REDESIGN_PLAN.md Chapter 4, design decision 7. */
export function EmptyDashboardState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center">
      <Inbox className="text-muted-foreground size-6" aria-hidden="true" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
