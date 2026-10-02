import { z } from "zod";
import { staffingCalendarPeriodSchema } from "./staffing-calendar";
import { staffingIdSchema, staffingListSchema } from "./staffing";
export const staffingOperationsSchema = z.object({ customerId: staffingIdSchema,
  ...staffingCalendarPeriodSchema.shape, ...staffingListSchema.shape }).strict().refine(value =>
    staffingCalendarPeriodSchema.safeParse({ fromDate: value.fromDate, toDate: value.toDate }).success,
  "Operations period covers one to 91 resource-local service dates");
