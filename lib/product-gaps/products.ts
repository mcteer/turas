import { canonicalExpansionProduct } from '../expansion/products';
/** Shares the existing governed identity vocabulary; no capability is inferred from a key. */
export function canonicalGapProduct(key:string){if(key==='unknown')return {key,retired:false,vocabularyVersion:'expansion-products-v1'};return canonicalExpansionProduct(key);}
