/** Fixed content-free labels only; no customer, source, actor, prompt or native identifiers. */
export function learningOperationalMetric(metric:'maintenance_duration_ms'|'maintenance_records'|'maintenance_failed',value:number){
 if(!Number.isSafeInteger(value)||value<0||value>1000000)throw Error('Invalid learning operational metric');
 console.info(JSON.stringify({kind:'turas_learning_metric',metric,value}));
}
