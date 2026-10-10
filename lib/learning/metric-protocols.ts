import {learningMetricSchema,learningQuarterSchema} from '../contracts/learning';
export type LearningMetric=ReturnType<typeof learningMetricSchema.parse>;
export const learningMetricProtocols={
 deployment_lead_time:{version:'deployment-lead-time-v1',unit:'minutes',definition:'Mean minutes from committed change to successful Production deployment across the complete predeclared workload population',attributionLagMs:0},
 change_failure_rate:{version:'change-failure-rate-v1',unit:'percentage points',definition:'Percentage of Production deployments causing accepted rollback, emergency remediation or service impairment within 24 hours; each deployment counted once',attributionLagMs:86400000},
} as const;
export function learningQuarterWindows(metric:LearningMetric,quarter:string,now:Date){
 learningMetricSchema.parse(metric);learningQuarterSchema.parse(quarter);
 if(!Number.isFinite(now.getTime()))throw Error('A valid server time is required');
 const year=Number(quarter.slice(0,4)),month=(Number(quarter.at(-1))-1)*3,start=new Date(Date.UTC(year,month,1)),end=new Date(Date.UTC(year,month+3,1)),lag=learningMetricProtocols[metric].attributionLagMs;
 if(now.getTime()<end.getTime()+lag)throw Error('Completed quarter and attribution lag required');
 return {baseline:{start:start.toISOString(),end:new Date(start.getTime()+14*86400000).toISOString()},current:{start:new Date(end.getTime()-14*86400000).toISOString(),end:end.toISOString()},eligibleAt:new Date(end.getTime()+lag).toISOString()};
}
