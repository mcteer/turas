import type {GapContent} from '../contracts/product-gaps';
export type GapRank={id:string;due:boolean;severity:GapContent['severity'];confirmed:number;workaround:GapContent['workaroundFeasibility'];lastReviewAt:string|null};
const severity={critical:0,high:1,medium:2,low:3,unknown:4},workaround={none:0,limited:1,unknown:2,feasible:3};
export function compareGapRank(a:GapRank,b:GapRank){return Number(b.due)-Number(a.due)||severity[a.severity]-severity[b.severity]||b.confirmed-a.confirmed||workaround[a.workaround]-workaround[b.workaround]||(a.lastReviewAt?Date.parse(a.lastReviewAt):0)-(b.lastReviewAt?Date.parse(b.lastReviewAt):0)||a.id.localeCompare(b.id);}
export const gapOrderVersion='gap-order-v1' as const;
