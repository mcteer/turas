import {tasks,type SessionView} from 'eve/events';

/** Eve owns task lifecycle and message ordering. Do not rebuild its reducer. */
export function backgroundChatActivity(view:SessionView){
 const working=tasks(view,{status:'working'});
 return {thinking:working.length>0,admittedAt:Math.max(0,...working.map(task=>Date.parse(task.startedAt??'')).filter(Number.isFinite))};
}
