import { useFetcher } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CopyIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";

interface DuplicableItem {
  id: string;
  title: string;
}

export function WeekActionsMenu({
  items,
  onAddNew,
}: {
  items: DuplicableItem[];
  onAddNew: () => void;
}) {
  const fetcher = useFetcher();
  const count = items.length;
  const isSubmitting = fetcher.state !== "idle";

  const duplicate = () => {
    if (count === 0) return;
    const fd = new FormData();
    for (const item of items) fd.append("ids", item.id);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/deliverables/duplicate-week",
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Week actions"
          aria-label="Week actions"
          disabled={isSubmitting}
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onAddNew}>
          <PlusIcon className="size-3.5 mr-2" />
          Add new
        </DropdownMenuItem>
        {count > 0 && (
          <DropdownMenuItem onSelect={duplicate}>
            <CopyIcon className="size-3.5 mr-2" />
            Duplicate to next week
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
