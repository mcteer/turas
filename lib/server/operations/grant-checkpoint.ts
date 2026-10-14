import {createHash} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
/** Canonical role names and object identities, never catalog OIDs or database
 * names. Compare actual source/restore permissions across owned databases. */
export async function recoveryGrantCheckpoint(db:Client|PoolClient){
 const result=await db.query(`SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY c.relname,a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','S','f')),
 'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.attname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY c.relname,t.attname,a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text)
  FROM pg_attribute t JOIN pg_class c ON c.oid=t.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(t.attacl) a WHERE n.nspname='public' AND t.attnum>0 AND NOT t.attisdropped),
 'routines',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY p.oid::regprocedure::text,a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public'),
 'schemas',(SELECT jsonb_agg(jsonb_build_array(n.nspname,pg_get_userbyid(n.nspowner),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY n.nspname,a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text)
  FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public'),
 'defaults',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),COALESCE(n.nspname,'*'),d.defaclobjtype,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY d.defaclrole::regrole::text,COALESCE(n.nspname,'*'),d.defaclobjtype,a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a),
 'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig) ORDER BY rolname) FROM pg_roles WHERE rolname='postgres' OR rolname LIKE 'turas\\_%' ESCAPE '\\'),
 'memberships',(SELECT jsonb_agg(jsonb_build_array(r.rolname,u.rolname,g.rolname,m.admin_option,m.inherit_option,m.set_option) ORDER BY r.rolname,u.rolname,g.rolname) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member JOIN pg_roles g ON g.oid=m.grantor WHERE r.rolname LIKE 'turas\\_%' ESCAPE '\\' OR u.rolname LIKE 'turas\\_%' ESCAPE '\\')
 ) AS metadata`);
 if(result.rows.length!==1||!result.rows[0].metadata?.relations||!result.rows[0].metadata?.routines)throw Error('Recovery grant inventory unavailable');
 return createHash('sha256').update(JSON.stringify(result.rows[0].metadata)).digest('hex');
}
