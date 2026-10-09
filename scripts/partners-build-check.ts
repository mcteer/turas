import {mkdir,writeFile} from "node:fs/promises";
import {withPartnerEnvironment} from "./partners-environment";
import {featureSourceDigest} from "./execution-source-digest";
if(process.argv.length!==2)throw Error("Owned partner build accepts no overrides");
const sourceDigest=await featureSourceDigest("013");
await withPartnerEnvironment(async environment=>{await environment.startProduction();await environment.stop();},{deadlineMs:660000});
if(await featureSourceDigest("013")!==sourceDigest)throw Error("Partner build source changed");
const evidence={sourceDigest,web:true,eve:true,hostedProof:false};await mkdir("local-artifacts/013",{recursive:true,mode:0o700});await writeFile("local-artifacts/013/build.json",JSON.stringify(evidence),{mode:0o600});console.log(JSON.stringify(evidence));
