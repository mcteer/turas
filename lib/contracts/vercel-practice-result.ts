import {z} from 'zod';

export const practiceBriefSchema=z.object({summary:z.string().trim().min(20).max(2500),
 practices:z.array(z.object({practice:z.string().trim().min(10).max(700),rationale:z.string().trim().min(10).max(700),
  sourceIds:z.array(z.string().min(1).max(80)).min(1).max(8),caveat:z.string().trim().min(10).max(500)}).strict()).min(1).max(12),
 gaps:z.array(z.string().trim().min(10).max(500)).max(10),}).strict();
export const practiceResultSchema=z.object({status:z.enum(['ready','incomplete']),product:z.string().min(1).max(160),topic:z.string().min(1).max(500),
 brief:practiceBriefSchema,storedAt:z.iso.datetime(),refreshAfter:z.iso.datetime(),
 sources:z.array(z.object({id:z.string().min(1).max(80),url:z.url().max(2000),title:z.string().max(300),publishedAt:z.iso.date().nullable(),checkedAt:z.iso.datetime(),refreshAfter:z.iso.datetime()}).strict()).min(1).max(96),}).strict();

