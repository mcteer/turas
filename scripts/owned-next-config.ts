import {lstat,readFile,realpath,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
/** Disposable copies only: Next must resolve the physical dependency targets,
 * including when a second owned evaluation is nested inside the first. */
export async function configureOwnedNextDependencyRoot(appRoot:string){
 const app=await realpath(appRoot),configPath=join(app,'next.config.ts'),info=await lstat(configPath);
 if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('Owned regular Next configuration required');
 const dependencies=await Promise.all([realpath(join(app,'node_modules')),realpath(join(app,'packages/artifact-extractor/node_modules'))]);
 let root=app;
 while(dependencies.some(path=>path!==root&&!path.startsWith(root+'/'))){const parent=dirname(root);if(parent===root)throw Error('Bounded owned dependency root required');root=parent;}
 if(root===resolve('/'))throw Error('Bounded owned dependency root required');
 const exported='export default withEve(nextConfig);',config=await readFile(configPath,'utf8');
 if(config.split(exported).length!==2)throw Error('Owned Next configuration shape changed');
 const clean=config.replace(/^nextConfig\.turbopack = .*\/\/ owned-(?:plan-turbopack-root|next-dependency-root)-v1\n/gm,'');
 await writeFile(configPath,clean.replace(exported,`nextConfig.turbopack = {...nextConfig.turbopack, root: ${JSON.stringify(root)}}; // owned-next-dependency-root-v1\n${exported}`));
 return root;
}
