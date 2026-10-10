/** Accounting displays retain all six micro-USD places without float rounding. */
export function learningUsd(microUsd:string):string{
 if(!/^(?:0|[1-9]\d*)$/.test(microUsd))throw Error('Invalid micro-USD amount');
 const value=BigInt(microUsd);return `${value/1000000n}.${(value%1000000n).toString().padStart(6,'0')}`;
}
