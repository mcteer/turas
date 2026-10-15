import type { MessageStreamEvent } from "eve/client";
import type { EveMessage } from "eve/react";
const researchTasks = new Set(["wait_for_customer_research","customer-recon","vercel-best-practices","implementation-research"]);

function waitingTask(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") {
    try { return waitingTask(JSON.parse(value), depth + 1); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  if ("status" in value && value.status === "working" && "taskId" in value && typeof value.taskId === "string") return value.taskId;
  if ("value" in value) return waitingTask(value.value, depth + 1);
  if ("text" in value) return waitingTask(value.text, depth + 1);
  if ("content" in value && Array.isArray(value.content)) {
    for (const content of value.content.slice(0, 5)) { const task = waitingTask(content, depth + 1); if (task) return task; }
  }
  return null;
}

export function visibleChatMessages(
  messages: readonly EveMessage[],
  events: readonly MessageStreamEvent[],
): readonly EveMessage[] {
  const taskPrefixes = new Set<string>();
  const failedPrefixes = new Set<string>();
  const internalTurns = new Set<string>();
  const failedTurns = new Set<string>();
  for (const event of events) {
    if (event.type === "action.result" && "toolName" in event.data.result && researchTasks.has(event.data.result.toolName)) {
      const taskId = waitingTask(event.data.result.output);
      if (taskId) {
        taskPrefixes.add(`Background task ${taskId} (${event.data.result.toolName}) is completed.`);
        failedPrefixes.add(`Background task ${taskId} (${event.data.result.toolName}) failed.`);
      }
    }
    if (event.type === "subagent.completed" && event.data.backgroundTask) {
      taskPrefixes.add(
        `Background task ${event.data.backgroundTask.taskId} (${event.data.subagentName}) is completed.`,
      );
      failedPrefixes.add(
        `Background task ${event.data.backgroundTask.taskId} (${event.data.subagentName}) failed.`,
      );
    }
    if(event.type==='message.received' && event.data.kind==='execution.background_task' && !event.meta.deliveryIds?.length)
      internalTurns.add(event.data.turnId);
    // Eve projects background wake-ups as user messages. Real deliveries
    // carry deliveryIds; leave them visible even when they quote a task notice.
    if (
      event.type === "message.received" &&
      !event.meta.deliveryIds?.length &&
      [...taskPrefixes].some((prefix) =>
        event.data.message === prefix || event.data.message.startsWith(`${prefix}\n`),
      )
    ) {
      internalTurns.add(event.data.turnId);
    }
    if (
      event.type === "message.received" &&
      !event.meta.deliveryIds?.length &&
      [...failedPrefixes].some((prefix) =>
        event.data.message === prefix || event.data.message.startsWith(`${prefix}\n`),
      )
    ) {
      failedTurns.add(event.data.turnId);
    }
  }
  const visible:EveMessage[]=messages.filter((message) =>
    message.role !== "user" ||
    !message.metadata?.turnId ||
    !internalTurns.has(message.metadata.turnId),
  ).map((message) => {
    if (message.role !== "user" || !message.metadata?.turnId || !failedTurns.has(message.metadata.turnId))
      return message;
    // Keep failure visible even if the parent never produces an explanation.
    // Raw error details remain in the authorized event stream.
    return {
      ...message,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "Background research stopped before a result was handed back. Review any limit or cancellation notice above. You can start a new research request when you’re ready." }],
    };
  });
  // Eve keeps one assistant message per turn, including a placeholder created
  // before a correction. Render its step parts at their actual boundary so a
  // corrected answer cannot appear above the user message that requested it.
  const output=[...visible];
  for(const assistant of visible){
    const turnId=assistant.metadata?.turnId;if(assistant.role!=='assistant'||!turnId)continue;
    const deliveries=events.flatMap((event,index)=>event.type==='message.received'&&event.data.turnId===turnId
      ?[{index,id:`${event.meta.id}:user`}]:[]).filter(delivery=>visible.some(message=>message.id===delivery.id&&message.role==='user'));
    if(deliveries.length<2)continue;
    const groups=new Map<string,EveMessage['parts'][number][]>();
    for(const part of assistant.parts){
      const step='stepIndex' in part?part.stepIndex:undefined;
      const boundary=step===undefined?-1:events.findIndex(event=>event.type==='step.started'&&event.data.turnId===turnId&&event.data.stepIndex===step);
      const delivery=[...deliveries].reverse().find(delivery=>delivery.index<boundary)??deliveries[0];
      groups.set(delivery.id,[...(groups.get(delivery.id)??[]),part]);
    }
    const original=output.indexOf(assistant);if(original<0)continue;output.splice(original,1);
    for(const [deliveryId,parts]of groups){
      if(!parts.some(part=>part.type==='text'&&part.text.length))continue;
      const position=output.findIndex(message=>message.id===deliveryId);if(position<0)continue;
      output.splice(position+1,0,{...assistant,id:`${assistant.id}:${deliveryId}`,parts});
    }
  }
  return output;
}

// Admission finishes the initiating tool call, not the background work. Keep
// tracking its notification turn until the parent finishes the handoff.
export function backgroundChatActivity(
  events: readonly MessageStreamEvent[],
  now = Date.now(),
) {
  const tasks = new Map<string, {
    name: string;
    admittedAt: number;
    notificationTurn?: string;
    stopped: boolean;
    callId?:string;
  }>();
  for (const event of events) {
    if (event.type === "action.result" && "toolName" in event.data.result && researchTasks.has(event.data.result.toolName)) {
      const taskId = waitingTask(event.data.result.output);
      if(!taskId)for(const [id,task] of tasks)if(task.callId && task.callId===event.data.result.callId)tasks.delete(id);
      if (taskId && !tasks.has(taskId)) tasks.set(taskId, { name: event.data.result.toolName, admittedAt: Date.parse(event.meta.at), stopped: false,callId:event.data.result.callId });
    }
    if (event.type === "subagent.completed" && event.data.backgroundTask?.status === "working") {
      const taskId = event.data.backgroundTask.taskId;
      if (!tasks.has(taskId)) tasks.set(taskId, {
        name: event.data.subagentName,
        admittedAt: Date.parse(event.meta.at),
        stopped: false,
      });
    }
    if (event.type === "message.received" && !event.meta.deliveryIds?.length) {
      for (const [taskId, task] of tasks) {
        for (const outcome of ["is completed", "failed", "is cancelled", "cancelled"]) {
          const prefix = `Background task ${taskId} (${task.name}) ${outcome}.`;
          if (event.data.message === prefix || event.data.message.startsWith(`${prefix}\n`)) {
            task.notificationTurn = event.data.turnId;
            task.stopped = outcome !== "is completed";
          }
        }
      }
    }
    if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.cancelled") {
      for (const [taskId, task] of tasks)
        if (task.notificationTurn === event.data.turnId) tasks.delete(taskId);
    }
    if (event.type === "session.failed" || event.type === "session.completed") tasks.clear();
  }
  // Match the existing bounded catch-up window. Historical orphaned receipts
  // must not restart polling or imply that work is still running indefinitely.
  const pending = [...tasks.values()].filter(task =>
    Number.isFinite(task.admittedAt) && now - task.admittedAt < 10 * 60 * 1000,
  );
  return {
    thinking: pending.some(task => !task.stopped),
    admittedAt: Math.max(0, ...pending.map(task => task.admittedAt)),
  };
}
