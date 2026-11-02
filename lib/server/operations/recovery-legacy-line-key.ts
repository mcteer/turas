/** Schema083 expanded a native line into distinct facts. An authenticated old
 * whole-line denial remains broader than the new tuple: keep its original digest
 * so it denies every fact on that line, including nonzero indexes. Callers must
 * separately verify the actual enabled INSERT/UPDATE replay guard. */
export function legacyLineReplayKey(table:string,columns:readonly string[],actualKeys:readonly string[]):boolean{
 return table==='event_projections'&&JSON.stringify(columns)===JSON.stringify(['conversation_id','stream_index'])&&
  actualKeys.includes(JSON.stringify(['conversation_id','stream_fact_index','stream_index']));
}
