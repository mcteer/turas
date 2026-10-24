import type {Client} from 'pg';

/** Own idle transport errors until end(): callers combine this controller with
 * their deadline and check it before returning or publishing recovery proof. */
export function observeRecoveryConnection<T extends Client>(client:T,connectionLost:AbortController):T {
 client.on('error',error=>connectionLost.abort(error));
 return client;
}
