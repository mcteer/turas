export const supportPriorityOrder = { high: 0, normal: 1, low: 2 } as const;
export function compareSupportActions(a: { overdue: boolean; priority: keyof typeof supportPriorityOrder; createdAt: string; id: string },
  b: { overdue: boolean; priority: keyof typeof supportPriorityOrder; createdAt: string; id: string }): number {
  return Number(b.overdue) - Number(a.overdue) || supportPriorityOrder[a.priority] - supportPriorityOrder[b.priority] ||
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
