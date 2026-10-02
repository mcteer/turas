import { z } from "zod";
import { staffingDateSchema, staffingTimestampSchema, staffingTimezoneSchema, staffingCommandEnvelopeSchema, staffingExactCommandSchema } from "./staffing";
/** Syntax boundary only. Timezone gap/fold resolution belongs to the pinned
 * Temporal calendar implementation before any calendar approval/qualification. */
export const staffingLocalMinuteSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine(value => (staffingDateSchema.safeParse(value.slice(0, 10)).success || value === "2101-01-01T00:00"), "Invalid local date");
export const staffingExplicitOffsetSchema = z.string().regex(/^[+-](?:[01]\d|2[0-3]):[0-5]\d$/).nullable();
export const staffingLocalWindowSchema = z.object({ date: staffingDateSchema,
  from: staffingLocalMinuteSchema, to: staffingLocalMinuteSchema,
  fromOffset: staffingExplicitOffsetSchema, toOffset: staffingExplicitOffsetSchema,
}).strict().superRefine((window, context) => {
  const dayDelta = (Date.parse(`${window.to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${window.date}T00:00:00Z`)) / 86_400_000;
  if (window.from.slice(0, 10) !== window.date || dayDelta < 0 || dayDelta > 1) {
    context.addIssue({ code: "custom", message: "Window must begin on its service date and end by the following date" });
  }
  if (window.fromOffset && window.toOffset) {
    if (Date.parse(`${window.to}${window.toOffset}`) <= Date.parse(`${window.from}${window.fromOffset}`)) {
      context.addIssue({ code: "custom", message: "Window offsets must identify a positive elapsed interval" });
    }
  } else if (window.to <= window.from) context.addIssue({ code: "custom", message: "Explicit offsets required for a repeated-clock interval" });
});

const calendarLeaveSchema = z.object({ ...staffingLocalWindowSchema.shape,
  category: z.enum(["approved_leave", "annual_leave", "other"]).optional(),
}).strict().superRefine((value, ctx) => {
  const { category: _category, ...window } = value;
  const parsed = staffingLocalWindowSchema.safeParse(window);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: "Invalid leave interval" });
});
export const staffingCalendarDaySchema = z.object({ date: staffingDateSchema,
  contracted: z.array(staffingLocalWindowSchema).max(8), holidays: z.array(staffingLocalWindowSchema).max(16),
  leave: z.array(calendarLeaveSchema).max(16), protected: z.array(staffingLocalWindowSchema).max(16),
}).strict().superRefine((day, ctx) => {
  if (day.holidays.length + day.leave.length + day.protected.length > 16 ||
    [...day.contracted, ...day.holidays, ...day.leave, ...day.protected].some(window => window.date !== day.date)) {
    ctx.addIssue({ code: "custom", message: "Invalid daily interval count or local date" });
  }
});
/** Input syntax and certified coverage only. Approval must additionally resolve
 * every local endpoint using pinned Temporal, split midnight spans, recheck the
 * per-date bounds and retain UTC/timezone-data identity before persistence. */
export const staffingCalendarInputSchema = z.object({ timezone: staffingTimezoneSchema,
  observedAt: staffingTimestampSchema.refine(value => Date.parse(value) <= Date.now(), "Observation cannot be future dated"),
  nextReviewAt: staffingTimestampSchema, fromDate: staffingDateSchema, toDate: staffingDateSchema,
  days: z.array(staffingCalendarDaySchema).min(1).max(91),
}).strict().superRefine((calendar, ctx) => {
  const span = (Date.parse(calendar.toDate) - Date.parse(calendar.fromDate)) / 86_400_000;
  if (!Number.isFinite(Date.parse(calendar.fromDate)) || !Number.isFinite(Date.parse(calendar.toDate))) {
    ctx.addIssue({ code: "custom", message: "Invalid certified date" }); return;
  }
  const lastEndpoint = new Date(Date.parse(calendar.toDate) + 86_400_000).toISOString().slice(0, 10) + "T00:00";
  if (span < 0 || span > 90 || calendar.days.length !== span + 1 ||
    new Set(calendar.days.map(day => day.date)).size !== calendar.days.length ||
    calendar.days.some(day => day.date < calendar.fromDate || day.date > calendar.toDate ||
      [...day.contracted, ...day.holidays, ...day.leave, ...day.protected].some(window => window.to > lastEndpoint)) ||
    Date.parse(calendar.nextReviewAt) < Date.parse(calendar.observedAt)) {
    ctx.addIssue({ code: "custom", message: "Invalid certified coverage or review interval" });
  }
});
export const staffingCreateCalendarSchema = z.object({ ...staffingCommandEnvelopeSchema.shape, calendar: staffingCalendarInputSchema }).strict();
export const staffingReviseCalendarSchema = z.object({ ...staffingExactCommandSchema.shape, calendar: staffingCalendarInputSchema }).strict();
export type StaffingCalendarInput = z.infer<typeof staffingCalendarInputSchema>;
export const staffingCalendarPeriodSchema = z.object({ fromDate: staffingDateSchema, toDate: staffingDateSchema }).strict()
  .refine(value => {
    const span = (Date.parse(value.toDate) - Date.parse(value.fromDate)) / 86_400_000;
    return span >= 0 && span <= 90;
  }, "Calendar read covers one to 91 inclusive dates");
