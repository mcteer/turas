import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { database } from "../../lib/server/research/specialists/database";
const isolatedTestUrl=requireTestDatabaseUrl();
beforeAll(()=>{process.env.DATABASE_URL=isolatedTestUrl;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});

it("keeps legacy queries lazy and rolls every write back on transaction failure",async()=>{
  const owner=new Client({connectionString:isolatedTestUrl});await owner.connect();
  try {
    const key=randomUUID(),sql=database();
    const write=sql.query(`INSERT INTO turas_evidence_fetches(environment_id,workspace_id,key)
      VALUES('test','test',$1)`,[key]);
    expect((await owner.query("SELECT 1 FROM turas_evidence_fetches WHERE key=$1",[key])).rowCount).toBe(0);
    await expect(sql.transaction([write,sql.query("SELECT 1/0")])).rejects.toBeDefined();
    expect((await owner.query("SELECT 1 FROM turas_evidence_fetches WHERE key=$1",[key])).rowCount).toBe(0);
    await sql.transaction([sql.query(`INSERT INTO turas_evidence_fetches(environment_id,workspace_id,key)
      VALUES('test','test',$1)`,[key])]);
    expect((await owner.query("SELECT 1 FROM turas_evidence_fetches WHERE key=$1",[key])).rowCount).toBe(1);
  }finally{await owner.end();}
});
