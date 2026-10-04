/** Deliberately independent fixture arithmetic; does not import implementation. */
export function reportMinuteOracle(contributions:Array<{identity:string;date:string;minutes:number;approved:boolean;reversed:boolean}>,from:string,to:string,cutoff:string){
 const unique=new Map(contributions.filter(row=>row.approved).map(row=>[row.identity,row]));
 const counted=[...unique.values()].filter(row=>!row.reversed && row.date<=cutoff);
 return {period:counted.filter(row=>row.date>=from && row.date<=to).reduce((sum,row)=>sum+row.minutes,0),cumulative:counted.reduce((sum,row)=>sum+row.minutes,0)};
}
export function reportMeasurementOracle(baseline:number,current:number,sameMeasure:boolean,sameUnit:boolean,sameScope:boolean,sameMethod:boolean){
 if(!sameMeasure || !sameUnit || !sameScope || !sameMethod)return {change:null,percentage:null};
 return {change:current-baseline,percentage:baseline===0?null:Math.round((current-baseline)/baseline*10000)/100};
}
