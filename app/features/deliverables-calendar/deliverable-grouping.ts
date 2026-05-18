import { isoWeek } from "./iso-week";

export interface DeliverableForGrouping {
  id: string;
  title: string;
  notes: string | null;
  date: string; // YYYY-MM-DD
  status: "planned" | "done" | "cancelled";
  archived: boolean;
  createdAt: Date;
}

export interface WeekGroup {
  week: number;
  year: number;
  items: DeliverableForGrouping[];
}

export interface GroupedDeliverables {
  weekGroups: WeekGroup[];
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function groupDeliverables(
  deliverables: DeliverableForGrouping[],
  today: Date
): GroupedDeliverables {
  const active = deliverables.filter((d) => !d.archived);

  const sorted = [...active].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const todayWeek = isoWeek(today);
  const weekKey = (w: number, y: number) =>
    `${y}-${String(w).padStart(2, "0")}`;

  const byWeek = new Map<string, WeekGroup>();

  // Ensure current week is always present
  const todayKey = weekKey(todayWeek.week, todayWeek.year);
  byWeek.set(todayKey, {
    week: todayWeek.week,
    year: todayWeek.year,
    items: [],
  });

  for (const d of sorted) {
    const { week, year } = isoWeek(parseDate(d.date));
    const key = weekKey(week, year);
    let group = byWeek.get(key);
    if (!group) {
      group = { week, year, items: [] };
      byWeek.set(key, group);
    }
    group.items.push(d);
  }

  const weekGroups = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group);

  return { weekGroups };
}
