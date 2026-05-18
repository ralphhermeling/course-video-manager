import { isoWeek } from "./iso-week";

export type DeliverableStatus = "planned" | "done" | "cancelled";

export interface DeliverableForDisplay {
  date: string; // YYYY-MM-DD
  status: DeliverableStatus;
}

export type DeliverableBucket = "this-week" | "future-week";

export function deliverableDisplay(
  d: DeliverableForDisplay,
  today: Date
): { bucket: DeliverableBucket } {
  const todayWeek = isoWeek(today);
  const [y, m, day] = d.date.split("-").map(Number);
  const itemWeek = isoWeek(new Date(y!, m! - 1, day!));

  const isThisWeek =
    itemWeek.week === todayWeek.week && itemWeek.year === todayWeek.year;

  return { bucket: isThisWeek ? "this-week" : "future-week" };
}
