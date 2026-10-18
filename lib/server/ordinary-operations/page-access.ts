import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {getCurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {periodSchema} from './reads';
export async function operationsPageSession(){const actor=await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN,{headers:{cookie:(await cookies()).toString()}}));if(!actor)redirect('/login');return actor;}
export function operationsPagePeriod(query:Record<string,string|string[]|undefined>){const today=new Date().toISOString().slice(0,10);return periodSchema.parse({fromDate:query.fromDate??today,toDate:query.toDate??today});}
