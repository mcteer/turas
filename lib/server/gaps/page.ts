import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {getCurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {lockGapActor} from './policy';
export async function requireGapPage(){const actor=await getCurrentSession(new Request(getServerConfig().TURAS_APP_ORIGIN,{headers:{cookie:(await cookies()).toString()}}));if(!actor)redirect('/login');if(actor.kind!=='internal')notFound();await withTransaction(db=>lockGapActor(db,actor));return actor;}
