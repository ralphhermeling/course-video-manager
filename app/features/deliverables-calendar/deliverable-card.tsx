import { useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  PITCH_STATUS_ORDER,
  STATUS_META,
} from "@/components/status-icon-badge";
import {
  CourseBadge,
  PitchBadge,
  PriorityPill,
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
  const linkFetcher = useFetcher();

  function submitLinkUpdate(courseIds: string[], pitchIds: string[]) {
    const fd = new FormData();
    fd.set("title", d.title);
    fd.set("date", d.date);
    fd.set("notes", d.notes ?? "");
    fd.set("status", d.status);
    for (const id of courseIds) fd.append("courseIds", id);
    for (const id of pitchIds) fd.append("pitchIds", id);
    linkFetcher.submit(fd, {
      method: "post",
      action: `/api/deliverables/${d.id}/update`,
    });
  }

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
              <ContextMenu key={c.id}>
                <ContextMenuTrigger className="cursor-context-menu">
                  <CourseBadge course={c} />
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuLabel>Change course</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuRadioGroup
                    value={c.id}
                    onValueChange={(newId) => {
                      submitLinkUpdate(
                        d.linkedCourses.map((lc) =>
                          lc.id === c.id ? newId : lc.id
                        ),
                        d.linkedPitches.map((lp) => lp.id)
                      );
                    }}
                  >
                    {allCourses
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((co) => (
                        <ContextMenuRadioItem
                          key={co.id}
                          value={co.id}
                          disabled={
                            d.linkedCourses.some((lc) => lc.id === co.id) &&
                            co.id !== c.id
                          }
                        >
                          {co.name}
                        </ContextMenuRadioItem>
                      ))}
                  </ContextMenuRadioGroup>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => {
                      submitLinkUpdate(
                        d.linkedCourses
                          .filter((lc) => lc.id !== c.id)
                          .map((lc) => lc.id),
                        d.linkedPitches.map((lp) => lp.id)
                      );
                    }}
                  >
                    <Trash2Icon className="size-3.5" />
                    Remove
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {d.linkedPitches.map((p) => (
              <ContextMenu key={p.id}>
                <ContextMenuTrigger className="cursor-context-menu">
                  <PitchBadge pitch={p} />
                </ContextMenuTrigger>
                <ContextMenuContent className="w-72">
                  <ContextMenuLabel>Change pitch</ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuRadioGroup
                    value={p.id}
                    onValueChange={(newId) => {
                      submitLinkUpdate(
                        d.linkedCourses.map((c) => c.id),
                        d.linkedPitches.map((lp) =>
                          lp.id === p.id ? newId : lp.id
                        )
                      );
                    }}
                  >
                    {PITCH_STATUS_ORDER.flatMap((status) => {
                      const inGroup = allPitches
                        .filter((ap) => ap.status === status)
                        .sort((a, b) =>
                          a.priority !== b.priority
                            ? a.priority - b.priority
                            : a.title.localeCompare(b.title)
                        );
                      if (inGroup.length === 0) return [];
                      const Icon = STATUS_META[status].icon;
                      return [
                        <ContextMenuLabel
                          key={`label-${status}`}
                          className="text-[10px] uppercase tracking-wider text-muted-foreground pt-2"
                        >
                          <span className="flex items-center gap-1.5">
                            <Icon className="size-3" />
                            {STATUS_META[status].label}
                          </span>
                        </ContextMenuLabel>,
                        ...inGroup.map((ap) => (
                          <ContextMenuRadioItem
                            key={ap.id}
                            value={ap.id}
                            disabled={
                              d.linkedPitches.some((lp) => lp.id === ap.id) &&
                              ap.id !== p.id
                            }
                          >
                            <span className="flex items-center gap-2">
                              <PriorityPill p={ap.priority} />
                              <span className="truncate">{ap.title}</span>
                            </span>
                          </ContextMenuRadioItem>
                        )),
                      ];
                    })}
                  </ContextMenuRadioGroup>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => {
                      submitLinkUpdate(
                        d.linkedCourses.map((c) => c.id),
                        d.linkedPitches
                          .filter((lp) => lp.id !== p.id)
                          .map((lp) => lp.id)
                      );
                    }}
                  >
                    <Trash2Icon className="size-3.5" />
                    Remove
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
