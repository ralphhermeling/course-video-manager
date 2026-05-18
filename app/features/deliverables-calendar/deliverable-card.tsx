import { useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleDashedIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  CourseBadge,
  PitchBadge,
  type LinkedCourse,
  type LinkedPitch,
} from "./deliverable-links";
import {
  DeliverableForm,
  type CourseOption,
  type PitchOption,
} from "./deliverable-form";

export interface DeliverableForCard {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  status: "planned" | "done" | "cancelled";
  linkedCourses: LinkedCourse[];
  linkedPitches: LinkedPitch[];
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function DeliverableActionsMenu({
  d,
  onEdit,
}: {
  d: DeliverableForCard;
  onEdit: () => void;
}) {
  const statusFetcher = useFetcher();
  const archiveFetcher = useFetcher();
  const duplicateFetcher = useFetcher();

  const setStatus = (status: "planned" | "done" | "cancelled") => {
    const fd = new FormData();
    fd.set("status", status);
    statusFetcher.submit(fd, {
      method: "post",
      action: `/api/deliverables/${d.id}/update-status`,
    });
  };

  const duplicate = () => {
    duplicateFetcher.submit(new FormData(), {
      method: "post",
      action: `/api/deliverables/${d.id}/duplicate`,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Actions"
          aria-label="Actions"
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onEdit}>
          <PencilIcon className="size-3.5 mr-2" />
          Edit…
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CircleDashedIcon className="size-3.5 mr-2" />
            Status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuItem
              disabled={d.status === "planned"}
              onSelect={() => setStatus("planned")}
            >
              <CircleDashedIcon className="size-3.5 mr-2" />
              Planned
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={d.status === "done"}
              onSelect={() => setStatus("done")}
            >
              <CheckIcon className="size-3.5 mr-2" />
              Done
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={d.status === "cancelled"}
              onSelect={() => setStatus("cancelled")}
            >
              <XIcon className="size-3.5 mr-2" />
              Cancelled
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={duplicate}>
          <CopyIcon className="size-3.5 mr-2" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 dark:text-red-400 focus:text-red-500 dark:focus:text-red-300"
          onSelect={() =>
            archiveFetcher.submit(new FormData(), {
              method: "post",
              action: `/api/deliverables/${d.id}/archive`,
            })
          }
        >
          <Trash2Icon className="size-3.5 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeliverableCard({
  d,
  todayStr,
  allCourses,
  allPitches,
}: {
  d: DeliverableForCard;
  todayStr: string;
  allCourses: CourseOption[];
  allPitches: PitchOption[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <DeliverableForm
          d={d}
          onClose={() => setEditing(false)}
          allCourses={allCourses}
          allPitches={allPitches}
        />
      </li>
    );
  }

  const day = parseDate(d.date);
  const overdue = d.status === "planned" && d.date < todayStr;
  const cancelled = d.status === "cancelled";
  const done = d.status === "done";

  return (
    <li
      className={cn(
        "rounded-lg border bg-background p-3 flex items-start gap-3",
        overdue ? "border-red-500/50 bg-red-500/5" : "border-border",
        cancelled && "opacity-50"
      )}
    >
      <div className="w-12 shrink-0 text-center">
        <div className="text-[10px] uppercase text-muted-foreground">
          {day.toLocaleDateString(undefined, { weekday: "short" })}
        </div>
        <div
          className={cn(
            "text-xl leading-none font-medium tabular-nums",
            overdue && "text-red-600 dark:text-red-400"
          )}
        >
          {day.getDate()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {overdue && (
            <AlertTriangleIcon className="size-3.5 text-red-600 dark:text-red-400 shrink-0" />
          )}
          {done && (
            <CheckIcon className="size-3.5 text-muted-foreground shrink-0" />
          )}
          {cancelled && (
            <XIcon className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span
            className={cn(
              "text-sm font-medium",
              done && "text-muted-foreground",
              cancelled && "line-through text-muted-foreground"
            )}
          >
            {d.title}
          </span>
          {overdue && (
            <span className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400">
              · Overdue
            </span>
          )}
          <DeliverableActionsMenu d={d} onEdit={() => setEditing(true)} />
        </div>
        {d.notes && (
          <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>
        )}
        {(d.linkedCourses.length > 0 || d.linkedPitches.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {d.linkedCourses.map((c) => (
              <CourseBadge key={c.id} course={c} />
            ))}
            {d.linkedPitches.map((p) => (
              <PitchBadge key={p.id} pitch={p} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
