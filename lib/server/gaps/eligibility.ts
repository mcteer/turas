import { HttpFailure } from '../../contracts/http';
export function isGapWithholding(error:unknown){return error instanceof HttpFailure&&[404,409,413,422].includes(error.status);}
