import { describe, expect, it } from "vitest";
import {
  deliverableDisplay,
  type DeliverableForDisplay,
} from "./deliverable-display";

const today = new Date(2026, 4, 18); // 2026-05-18, Monday, ISO week 21

function makeDeliverable(
  overrides: Partial<DeliverableForDisplay>
): DeliverableForDisplay {
  return {
    date: "2026-05-20",
    status: "planned",
    ...overrides,
  };
}

describe("deliverableDisplay", () => {
  it.each([
    {
      label: "planned, same ISO week → this-week",
      d: makeDeliverable({ date: "2026-05-18", status: "planned" }),
      expected: { bucket: "this-week" },
    },
    {
      label: "planned, end of current ISO week → this-week",
      d: makeDeliverable({ date: "2026-05-24", status: "planned" }),
      expected: { bucket: "this-week" },
    },
    {
      label: "planned, next week → future-week",
      d: makeDeliverable({ date: "2026-05-25", status: "planned" }),
      expected: { bucket: "future-week" },
    },
    {
      label: "planned, past week → future-week (no overdue in slice 1)",
      d: makeDeliverable({ date: "2026-05-10", status: "planned" }),
      expected: { bucket: "future-week" },
    },
    {
      label: "done, current week → this-week",
      d: makeDeliverable({ date: "2026-05-20", status: "done" }),
      expected: { bucket: "this-week" },
    },
    {
      label: "done, past week → future-week",
      d: makeDeliverable({ date: "2026-05-05", status: "done" }),
      expected: { bucket: "future-week" },
    },
    {
      label: "cancelled, current week → this-week",
      d: makeDeliverable({ date: "2026-05-19", status: "cancelled" }),
      expected: { bucket: "this-week" },
    },
    {
      label: "cancelled, future → future-week",
      d: makeDeliverable({ date: "2026-06-01", status: "cancelled" }),
      expected: { bucket: "future-week" },
    },
  ])("$label", ({ d, expected }) => {
    expect(deliverableDisplay(d, today)).toEqual(expected);
  });
});
