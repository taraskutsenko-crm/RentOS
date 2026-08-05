import type { ReactNode } from "react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@rentos/ui";

export interface RowAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Declarative row-action list — every list page builds its overflow menu
 * from this instead of hand-assembling `DropdownMenuItem`s, so icon
 * placement and the destructive-group separator stay identical across
 * every module (see docs/UI_AUDIT.md finding #18). Pass the result as a
 * `DataTable`'s `rowActions` render prop.
 */
export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const destructive = actions.filter((action) => action.destructive);
  const regular = actions.filter((action) => !action.destructive);

  return (
    <>
      {regular.map((action) => (
        <DropdownMenuItem
          key={action.id}
          onClick={action.onClick}
          disabled={action.disabled ?? false}
        >
          {action.icon}
          {action.label}
        </DropdownMenuItem>
      ))}
      {regular.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
      {destructive.map((action) => (
        <DropdownMenuItem
          key={action.id}
          variant="destructive"
          onClick={action.onClick}
          disabled={action.disabled ?? false}
        >
          {action.icon}
          {action.label}
        </DropdownMenuItem>
      ))}
    </>
  );
}
