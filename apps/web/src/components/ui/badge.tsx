import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-green-500/15 text-green-600 dark:text-green-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  danger: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

export function Badge({ children, variant = "default", className }: { children: React.ReactNode; variant?: keyof typeof styles; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", styles[variant], className)}>
      {children}
    </span>
  );
}

// Map common ERP statuses to a badge variant
export function statusVariant(status: string): keyof typeof styles {
  const s = status.toUpperCase();
  if (["PAID", "APPROVED", "ACTIVE", "WON", "CONFIRMED", "ACCEPTED"].includes(s)) return "success";
  if (["SENT", "PARTIAL", "PENDING", "DRAFT", "PROPOSAL", "QUALIFIED"].includes(s)) return "warning";
  if (["OVERDUE", "REJECTED", "CANCELLED", "LOST", "TERMINATED"].includes(s)) return "danger";
  return "muted";
}
