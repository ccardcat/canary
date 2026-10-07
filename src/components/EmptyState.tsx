import type { ReactNode } from "react";
import { Package, type LucideIcon } from "lucide-react";

/** A contained message with the same hierarchy in pages, panels and dialogs. */
export function EmptyState({ icon: Icon = Package, title, description, action, className="" }: {
  className?:string; icon?: LucideIcon; title: string; description?: string; action?: ReactNode;
}) {
  return <div className={`empty-state ${className}`} role="status">
    <Icon size={28} aria-hidden="true" />
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action}
  </div>;
}
