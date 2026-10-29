/** One fixed settings statement preserves the existing authorization query budget.
 * MATERIALIZED captures the prior transaction mode before updating its marker.
 * The boolean selects only read/write; it never grants operational authority. */
export const actorLockSettingsSql = `WITH prior AS MATERIALIZED (
 SELECT current_setting('turas.actor_lock_mode',true) AS mode
) SELECT set_config('lock_timeout',CASE WHEN current_setting('turas.partner_operation',true)='013' OR current_setting('turas.learning_operation',true)='014' THEN '2000ms' ELSE $1 END,true),
 prior.mode,set_config('turas.actor_lock_mode',CASE WHEN $2::boolean OR prior.mode='write' THEN 'write' ELSE 'read' END,true)
 FROM prior`;
