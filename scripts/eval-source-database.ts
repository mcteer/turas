import {spawnSync} from 'node:child_process';
import {requireTestDatabaseUrl} from '../tests/fixtures/database';
import {requireOwnedPilotDatabase} from './pilot-environment';

/** Preserve legacy separation; the 016 exception requires its actual disposable
 * container and a separate runtime login, never a hosted or selected app source. */
export function requireEvaluationSourceDatabase(environment:NodeJS.ProcessEnv=process.env):string{
 let pilotSource=false;try{pilotSource=environment.TURAS_PILOT_OWNED==='1'&&/^\/turas_test_016_eval_[a-f0-9]{12}$/.test(new URL(environment.DATABASE_URL_UNPOOLED??'').pathname);}catch{/* Ordinary guard reports invalid sources. */}
 if(!pilotSource)return requireTestDatabaseUrl(environment);
 const raw=requireOwnedPilotDatabase(environment,true),owner=new URL(raw),runtime=new URL(environment.DATABASE_URL??'');
 if(environment.TURAS_TEST_DATABASE_URL!==raw||raw===environment.DATABASE_URL||runtime.protocol!==owner.protocol||runtime.host!==owner.host||runtime.pathname!==owner.pathname||runtime.username!=='turas_runtime'||owner.username!=='postgres')throw Error('Owned evaluation source requires runtime/owner separation');
 const token=owner.pathname.slice('/turas_test_016_eval_'.length),container='turas-016-check-'+token;
 if(environment.TURAS_TEST_POSTGRES_CONTAINER!==container)throw Error('Exact owned evaluation container required');
 const inspected=spawnSync('docker',['inspect',container],{encoding:'utf8',timeout:5000,maxBuffer:1048576});
 if(inspected.error||inspected.status!==0||typeof inspected.stdout!=='string')throw Error('Owned evaluation container unavailable');
 let rows:unknown;try{rows=JSON.parse(inspected.stdout);}catch{throw Error('Owned evaluation container unavailable');}
 if(!Array.isArray(rows)||rows.length!==1)throw Error('Owned evaluation container unavailable');
 const row=rows[0],ports=row?.NetworkSettings?.Ports?.['5432/tcp'];
 if(row?.Name!=='/'+container||row?.Config?.Labels?.['turas.016.owner']!==token||!Array.isArray(ports)||ports.length!==1||ports[0]?.HostIp!=='127.0.0.1'||ports[0]?.HostPort!==owner.port)throw Error('Actual evaluation container ownership or endpoint differs');
 return raw;
}
