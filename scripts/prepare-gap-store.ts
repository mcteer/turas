import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {prepareReportStore} from './prepare-reports';
import {requireGapStore} from '../lib/server/gaps/store';
/** Explicit helper-only setup; no brand, renderer or delivery registration. */
export async function prepareGapStore(){await prepareReportStore();await requireGapStore();}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)prepareGapStore().then(()=>console.log('Private engineering report namespace prepared')).catch(()=>{console.error('Engineering store preparation failed; verify explicit environment and private namespace');process.exitCode=1;});
