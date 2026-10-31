import {fileURLToPath as retiredFilePath} from 'node:url';
import {resolve as retiredResolve} from 'node:path';
// Historical private-pilot fixture module; standalone programme CLI retired.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';

/** Applicability is an index, never an actual-output review. These are the
 * governing feature commands; this command deliberately does not execute them. */
export const qualityCatalog = [
 {feature:'002–004',boundaries:['capability honesty','pending attachments and claims','owner privacy'],evaluation:'eval:behavior:local',verifier:'eval:behavior:verify'},
 {feature:'005-retrieval',boundaries:['eligible retrieval','exact citations','withdrawal and abstention'],evaluation:'eval:retrieval',verifier:'eval:retrieval'},
 {feature:'005-research',boundaries:['public research versus accepted customer evidence','unknowns','cancelled findings'],evaluation:'eval:research',verifier:'eval:research:verify'},
 {feature:'005-plans',boundaries:['accepted plan context','draft-only advice','current source fences'],evaluation:'eval:plans',verifier:'eval:plans:verify'},
 {feature:'007',boundaries:['staffing eligibility','numerical fidelity','advisory-only changes'],evaluation:'eval:staffing',verifier:'eval:staffing:verify'},
 {feature:'008',boundaries:['delivery evidence','owner acceptance','uncertain effects and replay'],evaluation:'eval:execution',verifier:'eval:execution:verify'},
 {feature:'010',boundaries:['support citations','unknowns','reviewed response boundary'],evaluation:'eval:support',verifier:'eval:support:verify'},
 {feature:'011',boundaries:['expansion citations','account-owner decisions','forbidden actions'],evaluation:'eval:expansion',verifier:'eval:expansion:verify'},
 {feature:'014',boundaries:['learning source eligibility','pilot isolation','administrator publication'],evaluation:'eval:learning',verifier:'node --import tsx scripts/verify-learning-review.ts'},
] as const;

export function qualityApplicability(paths:readonly string[]){
 if(paths.length>10000||paths.some(path=>!path||path.startsWith('/')||path.split('/').some(part=>part==='..'||part==='.')||/[\u0000-\u001f\u007f]/.test(path)))throw Error('Invalid quality source inventory');
 // Shared domain/auth/recovery code is deliberately conservative: an agent tool
 // can traverse several domains. A changed shared path affects every catalog.
 const behavioral=paths.filter(path=>/^(agent\/|lib\/|app\/api\/|migrations\/|packages\/)/.test(path)||['package.json','package-lock.json','next.config.ts','vercel.json'].includes(path));
 const fixtures=paths.filter(path=>path.startsWith('evals/'));
 return qualityCatalog.map(item=>({...item,
  applicability:behavioral.length||fixtures.length?'fresh-required' as const:'historical-review-required' as const,
  behavioralPaths:behavioral,fixturePaths:fixtures,
  currentActualModelProof:'unverified' as const,
  historicalProofAccepted:false,
  requirement:'Use the governing full verifier with exact current source, model, fixtures and captures. Changed behavior requires a fresh explicitly budgeted actual-provider evaluation and its required independent review.',
 }));
}

export async function pilotQuality(args=process.argv.slice(2)){
 if(args.length!==4||args[0]!=='--base'||!/^[a-f0-9]{40}$/.test(args[1])||args[2]!=='--output'||!args[3]||args[3].startsWith('--'))throw Error('Explicit full base commit and private output required');
 const base=args[1],root=resolve(args[3]);
 const git=(argv:string[])=>execFileSync('git',argv,{encoding:'utf8',maxBuffer:4*1024*1024});
 if(git(['rev-parse',base+'^{commit}']).trim()!==base)throw Error('Exact existing base required');
 git(['merge-base','--is-ancestor',base,'HEAD']);
 const source=await pilotSource();
 const inventory=()=>[...new Set([...git(['diff','--name-only','-z',base,'--']).split('\0'),...git(['ls-files','--others','--exclude-standard','-z']).split('\0')].filter(Boolean))].sort();
 const paths=inventory(),entries=qualityApplicability(paths);
 await createEvidenceDirectory(root);
 const current=await pilotSource();if(JSON.stringify(current)!==JSON.stringify(source)||JSON.stringify(inventory())!==JSON.stringify(paths))throw Error('Quality applicability source changed');
 const receipt={version:'pilot-quality-applicability-v1',id:randomUUID(),...source,baseCommit:base,observedAt:new Date().toISOString(),entries,
  state:'unverified',paidCalls:0,actualModelQualityVerified:false,hostedProof:false,budgetAdmitted:false,
  note:'Historical captures retain their original dates and identities. This index cannot approve captures, spend, publication or release.'};
 await writeEvidence(root,'quality.json',receipt);
 console.info(JSON.stringify({gate:'pilot-quality-applicability',catalogs:entries.length,freshRequired:entries.filter(item=>item.applicability==='fresh-required').length,actualModelQualityVerified:false,paidCalls:0}));return receipt;
}

if(process.argv[1]&&retiredResolve(process.argv[1])===retiredFilePath(import.meta.url)){console.error('Private pilot command retired; historical fixtures are import-only.');process.exitCode=2;}
