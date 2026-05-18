import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  groupDeliverables,
  type DeliverableForGrouping,
} from "@/features/deliverables-calendar/deliverable-grouping";
import { isoWeek } from "@/features/deliverables-calendar/iso-week";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { Console, Effect } from "effect";
import { CircleIcon, Plus } from "lucide-react";
import { useState } from "react";
import { data, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/deliverables._index";

export const meta: Route.MetaFunction = () => {
  return [{ title: "CVM - Deliverables Calendar" }];
};

export const loader = async () => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const [deliverables, courses, sidebarVideos, pitches, diagrams] =
      yield* Effect.all(
        [
          db.listDeliverables(),
          db.getCourses(),
          db.getStandaloneVideosSidebar(),
          db.listPitches(),
          db.listDiagrams(),
        ],
        { concurrency: "unbounded" }
      );

    return {
      deliverables: deliverables.map((d) => ({
        id: d.id,
        title: d.title,
        notes: d.notes,
        date: d.date,
        status: d.status as "planned" | "done" | "cancelled",
        archived: d.archived,
        createdAt: d.createdAt.toISOString(),
      })),
      courses: courses.map((c) => ({ id: c.id, name: c.name })),
      sidebarVideos: sidebarVideos.map((v) => ({ id: v.id, path: v.path })),
      pitches: pitches.map((p) => ({ id: p.id, title: p.title })),
      diagrams: diagrams.map((d) => ({ id: d.id, name: d.name })),
    };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function DeliverableRow({ d }: { d: DeliverableForGrouping }) {
  const day = parseDate(d.date);
  return (
    <li className="flex items-start gap-3 rounded-md border border-border p-2.5 bg-background">
      <div className="w-12 shrink-0 text-center">
        <div className="text-[10px] uppercase text-muted-foreground">
          {day.toLocaleDateString(undefined, { weekday: "short" })}
        </div>
        <div className="text-lg leading-none font-medium tabular-nums">
          {day.getDate()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm">{d.title}</span>
        {d.notes && (
          <p className="text-xs text-muted-foreground mt-0.5">{d.notes}</p>
        )}
      </div>
    </li>
  );
}

function CreateDeliverableForm({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      action="/api/deliverables/create"
      className="rounded-md border border-border p-3 bg-background space-y-3"
      onSubmit={() => {
        setTimeout(() => onClose(), 0);
      }}
    >
      <div className="space-y-2">
        <input
          name="title"
          type="text"
          required
          placeholder="Title"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <input
          name="date"
          type="date"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <textarea
          name="notes"
          placeholder="Notes (optional)"
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

export default function DeliverablesCalendarPage() {
  const { deliverables, courses, sidebarVideos, pitches, diagrams } =
    useLoaderData<typeof loader>();
  const [showForm, setShowForm] = useState(false);

  const today = new Date();
  const todayWeek = isoWeek(today);

  const deliverablesForGrouping: DeliverableForGrouping[] = deliverables.map(
    (d) => ({
      ...d,
      createdAt: new Date(d.createdAt),
    })
  );

  const { weekGroups } = groupDeliverables(deliverablesForGrouping, today);

  return (
    <div className="flex h-screen">
      <AppSidebar
        courses={courses}
        standaloneVideos={sidebarVideos}
        pitches={pitches}
        diagrams={diagrams}
      />

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <div className="border-b border-border px-6 py-3 flex items-center gap-3">
          <h1 className="text-sm font-semibold">Deliverables Calendar</h1>
          <span className="text-xs text-muted-foreground">
            Week {todayWeek.week}
          </span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5 mr-1.5" />
            New Deliverable
          </Button>
        </div>

        <div className="p-6 max-w-2xl mx-auto w-full">
          {showForm && (
            <div className="mb-5">
              <CreateDeliverableForm onClose={() => setShowForm(false)} />
            </div>
          )}

          <div className="space-y-5">
            {weekGroups.map((g) => {
              const isThisWeek =
                g.week === todayWeek.week && g.year === todayWeek.year;
              return (
                <section key={`${g.year}-${g.week}`}>
                  <header className="flex items-center gap-3 mb-2">
                    {isThisWeek ? (
                      <CircleIcon className="size-2 fill-foreground text-foreground" />
                    ) : (
                      <span className="size-2 inline-block rounded-full border border-muted-foreground/40" />
                    )}
                    <h3
                      className={cn(
                        "text-[11px] uppercase tracking-wider font-medium",
                        isThisWeek ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      Week {g.week}
                      {isThisWeek && " · this week"}
                    </h3>
                    <div
                      className={cn(
                        "h-px flex-1",
                        isThisWeek ? "bg-foreground/30" : "bg-border"
                      )}
                    />
                  </header>
                  {g.items.length > 0 ? (
                    <ul className="space-y-1.5">
                      {g.items.map((d) => (
                        <DeliverableRow key={d.id} d={d} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground italic pl-5">
                      No deliverables this week
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
