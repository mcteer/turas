/** Only explicitly present host settings cross into disposable test processes.
 * Assigning an undefined value to process.env creates the string "undefined",
 * which makes os.tmpdir() resolve a nonexistent relative directory on Linux. */
export function ownedParentEnvironment(environment:Record<string,string|undefined>=process.env):NodeJS.ProcessEnv{
 const keys=['PATH','HOME','TMPDIR','LANG','LC_ALL','SYSTEMROOT'] as const;
 return {...Object.fromEntries(keys.filter(key=>environment[key]!==undefined).map(key=>[key,environment[key]])),NODE_ENV:'test'};
}
