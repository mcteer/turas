import {actorLockSettingsSql} from "../profiles/authority-lock-sql";
/** Restricted internal SQL only. Keep transaction control in the exact-target
 * controller; unsupported escape/Unicode/dollar payload syntax fails closed. */
export function assertRecoveryDecisionSql(sql:string){
 const fail=()=>{throw Error('Recovery decision transaction control belongs to its controller');};
 if(typeof sql!=='string'||!sql.trim()||sql.length>1048576||/u&["']/i.test(sql))fail();
 let clean='',i=0;const literals:string[]=[];
 const identifier=(value:string|undefined)=>!!value&&/[A-Za-z0-9_$\u0080-\uFFFF]/.test(value);
 while(i<sql.length){
  if(sql.startsWith('--',i)){const end=sql.slice(i+2).search(/[\r\n]/);i=end<0?sql.length:i+2+end;clean+=' ';continue;}
  if(sql.startsWith('/*',i)){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}if(depth)fail();clean+=' ';continue;}
  if(sql[i]==="'"||sql[i]==='"'){
   const start=i,quote=sql[i],escape=quote==="'"&&/[eE]/.test(sql[i-1]??'')&&!identifier(sql[i-2]);let closed=false;if(escape)fail();i++;
   while(i<sql.length){if(sql[i]===quote){if(sql[i+1]===quote){i+=2;continue;}i++;closed=true;break;}i++;}
   if(!closed)fail();if(quote==="'"){const literal=sql.slice(start+1,i-1).replaceAll("''","'");clean+=` __recovery_literal_${literals.push(literal)-1}__ `;}else clean+=' '+sql.slice(start+1,i-1).replaceAll('""','"')+' ';continue;
  }
  if(sql[i]==='$'&&!identifier(sql[i-1])){const tag=/^(?:\$[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*\$|\$\$)/.exec(sql.slice(i))?.[0];if(tag)fail();}
  clean+=sql[i++];
 }
 const statements=clean.split(';').filter(value=>value.trim());if(!statements.length)fail();
 for(const statement of statements){
  const words=statement.trim().match(/^[A-Za-z]+(?:\s+[A-Za-z]+)?/)?.[0].toUpperCase().split(/\s+/)??[];
  if(words[0]==='ROLLBACK'){if(words[1]!=='TO')fail();}
  else if(words[0]==='SET'){if(!/^SET\s+LOCAL\s+(?:statement_timeout|lock_timeout)\s*(?:=|TO\b)/i.test(statement.trim()))fail();}
  else if(!['SELECT','WITH','INSERT','UPDATE','DELETE','LOCK','SAVEPOINT','RELEASE'].includes(words[0]))fail();
 }
 // Keep the parser's quoted-string rules fixed; canonical helpers use static
 // setting names and LOCAL timeouts, never parameterized parser configuration.
 if(/\b(?:standard_conforming_strings|backslash_quote)\b/i.test(clean))fail();
 for(const call of clean.matchAll(/\bset_config\s*\(\s*([^,]*)/gi)){const literal=/^__recovery_literal_(\d+)__\s*$/.exec(call[1]);if(!literal)fail();const name=literals[Number(literal![1])];
  if(name==='turas.actor_lock_mode'){
   // Only the canonical statement can select the constrained read/write marker.
   // Arbitrary settings, expressions and adjacent statements remain denied.
   if(sql!==actorLockSettingsSql)fail();
  }else if(!['statement_timeout','lock_timeout'].includes(name))fail();}
}
