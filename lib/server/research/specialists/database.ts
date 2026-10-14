import type { PoolClient, QueryResultRow } from "pg";
import { query as runtimeQuery, withTransaction } from "../../db/client";
import { getServerConfig } from "../../config";
import { HttpFailure } from "../../../contracts/http";

/** Legacy Neon queries are lazy. Keep that property when using pg: constructing
 * a transaction's query list must not execute its writes outside the transaction. */
export class ResearchQuery<Row extends QueryResultRow = QueryResultRow> implements PromiseLike<Row[]> {
  private result?: Promise<Row[]>;
  constructor(readonly text:string,readonly values:readonly unknown[]=[]) {}
  execute(client?:PoolClient):Promise<Row[]> {
    if (this.result) throw new Error("A research query cannot be replayed or moved into a transaction after execution");
    return this.result = (client ? client.query<Row>(this.text,[...this.values]) : runtimeQuery<Row>(this.text,this.values))
      .then(result=>result.rows);
  }
  then<TResult1=Row[],TResult2=never>(
    fulfilled?:((value:Row[])=>TResult1|PromiseLike<TResult1>)|null,
    rejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
  ):PromiseLike<TResult1|TResult2> {
    return (this.result ?? this.execute()).then(fulfilled,rejected);
  }
}
const sql = {
  query<Row extends QueryResultRow=QueryResultRow>(text:string,values:readonly unknown[]=[]) {
    return new ResearchQuery<Row>(text,values);
  },
  transaction(queries:readonly ResearchQuery[]) {
    return withTransaction(async client=>{
      const results: QueryResultRow[][]=[];
      for(const query of queries) results.push(await query.execute(client));
      return results;
    });
  },
};
export function database() { return sql; }
export async function ensureDatabase() {
  const marker=await runtimeQuery<{schema_version:number}>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1",
    [getServerConfig().TURAS_ENVIRONMENT_ID]);
  if((marker.rows[0]?.schema_version??0)<57) throw new HttpFailure(503,"research_unavailable","Specialist research migrations are unavailable");
}
