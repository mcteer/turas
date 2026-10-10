import {learningMeasurementWindowSchema,learningMetricSchema} from '../contracts/learning';
import type {LearningMetric} from './metric-protocols';
type Window=ReturnType<typeof learningMeasurementWindowSchema.parse>;
export type LearningRational={numerator:bigint;denominator:bigint};
const gcd=(a:bigint,b:bigint):bigint=>{a=a<0n?-a:a;while(b){const next=a%b;a=b;b=next;}return a;};
export function learningRational(numerator:bigint,denominator:bigint):LearningRational{
 if(denominator===0n)throw Error('Zero denominator is unavailable');if(denominator<0n){numerator=-numerator;denominator=-denominator;}const divisor=gcd(numerator,denominator);return {numerator:numerator/divisor,denominator:denominator/divisor};
}
export function learningAdd(a:LearningRational,b:LearningRational){return learningRational(a.numerator*b.denominator+b.numerator*a.denominator,a.denominator*b.denominator);}
function decimal(value:string){const [whole,fraction='']=value.split('.');return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));}
export function learningCustomerChange(metric:LearningMetric,baseline:Window,current:Window):LearningRational|null{
 learningMetricSchema.parse(metric);baseline=learningMeasurementWindowSchema.parse(baseline);current=learningMeasurementWindowSchema.parse(current);
 if(baseline.deployments===0||current.deployments===0)return null;
 const value=(window:Window)=>{
  if(metric==='deployment_lead_time'){if(window.totalMinutes===null||window.failedDeployments!==null)throw Error('Lead time requires total minutes and deployment count');return learningRational(decimal(window.totalMinutes),BigInt(window.deployments)*1000000n);}
  if(window.failedDeployments===null||window.totalMinutes!==null)throw Error('Failure rate requires failed and total deployment counts');return learningRational(BigInt(window.failedDeployments)*100n,BigInt(window.deployments));
 };
 const before=value(baseline),after=value(current);return learningAdd(after,{numerator:-before.numerator,denominator:before.denominator});
}
/** Round only the final equal-customer mean, with ties away from zero. */
export function learningRoundedMean(changes:readonly LearningRational[]):string{
 if(!changes.length||changes.length>10000)throw Error('Bounded nonempty population required');
 const started=performance.now();let total=learningRational(0n,1n);for(const change of changes){if(performance.now()-started>5000)throw Error('Exact outcome calculation deadline reached');total=learningAdd(total,learningRational(change.numerator,change.denominator));}
 const mean=learningRational(total.numerator,total.denominator*BigInt(changes.length)),negative=mean.numerator<0n,absolute=(negative?-mean.numerator:mean.numerator)*100n;
 let cents=absolute/mean.denominator;if((absolute%mean.denominator)*2n>=mean.denominator)cents++;
 return `${negative&&cents!==0n?'-':''}${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
}
