import {expect,it,vi} from "vitest";
import {recordExecutionTelemetry} from "../../lib/server/execution/telemetry";
import {timeFixture,draftTime} from "../fixtures/execution/time";
it("retains null unknown usage and rejects content or identities before logging",()=>{
  const output:string[]=[];const logger=vi.spyOn(console,"info").mockImplementation(value=>output.push(String(value)));
  vi.stubEnv("NODE_ENV","development");
  try{
    recordExecutionTelemetry({operation:"model",outcome:"unconfirmed",durationMs:12,inputTokens:null,outputTokens:null});
    recordExecutionTelemetry({operation:"model",outcome:"committed",durationMs:0,inputTokens:0,outputTokens:0});
    expect(output.map(value=>JSON.parse(value))).toEqual([
      {operation:"execution.model",outcome:"unconfirmed",durationMs:12,inputTokens:null,outputTokens:null},
      {operation:"execution.model",outcome:"committed",durationMs:0,inputTokens:0,outputTokens:0},
    ]);
    for(const field of ["prompt","response","customerId","rationale","note","rate","providerError"])
      expect(()=>recordExecutionTelemetry({operation:"read",outcome:"failed",durationMs:1,[field]:"PRIVATE_TELEMETRY_SENTINEL"})).toThrow();
    for(const bad of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>recordExecutionTelemetry({operation:"model",outcome:"committed",durationMs:1,outputTokens:bad})).toThrow();
    expect(output).toHaveLength(2);expect(output.join("\n")).not.toContain("PRIVATE_TELEMETRY_SENTINEL");
  }finally{logger.mockRestore();vi.unstubAllEnvs();}
});
it("keeps actual private time input out of ordinary domain telemetry",async()=>{
  const f=await timeFixture(),output:string[]=[];const logger=vi.spyOn(console,"info").mockImplementation(value=>output.push(String(value)));
  try{await draftTime(f,{note:"PRIVATE_EXECUTION_TELEMETRY_NOTE"});expect(output.join("\n")).not.toMatch(/PRIVATE_EXECUTION_TELEMETRY_NOTE|PRIVATE_TIME_NOTE_SENTINEL/);}
  finally{logger.mockRestore();}
});
