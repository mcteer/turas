const duration={preview:5*60_000,invalidated:24*60*60_000,report:30*24*60*60_000,obsolete:90*24*60*60_000,receipt:365*24*60*60_000} as const;
export function gapRetentionDeadline(kind:keyof typeof duration,at:string|Date){const time=new Date(at).getTime();if(!Number.isFinite(time))throw Error('Invalid retention origin');return new Date(time+duration[kind]).toISOString();}
