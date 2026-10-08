import { expansionProductKey } from "../contracts/expansion";
export const expansionProductVocabularyVersion="expansion-products-v1" as const;
export type ProductAlias={key:string;aliases:string[];retired:boolean;provenance:string};
/** Identity aliases only. Capabilities, availability and adoption always require evidence. */
export const expansionProductAliases:readonly ProductAlias[]=[];
export function validateProductAliases(entries:readonly ProductAlias[]) {
  if(entries.length>100)throw new Error("Product vocabulary exceeds its limit");
  const seen=new Set<string>();
  for(const entry of entries){expansionProductKey.parse(entry.key);
    if(!entry.provenance.trim()||entry.aliases.length>20)throw new Error("Product alias provenance or bound invalid");
    for(const alias of [entry.key,...entry.aliases]){const key=alias.normalize("NFKC").trim().toLowerCase();
      if(!key||alias.length>200||seen.has(key))throw new Error("Product alias is empty, duplicate or oversized");seen.add(key);}
  }
}
export function canonicalExpansionProduct(key:string,entries:readonly ProductAlias[]=expansionProductAliases){
  validateProductAliases(entries);
  const normalized=key.normalize("NFKC").trim().toLowerCase();
  const entry=entries.find(e=>e.key===normalized||e.aliases.some(a=>a.normalize("NFKC").trim().toLowerCase()===normalized));
  return {key:entry?.key??expansionProductKey.parse(normalized),retired:entry?.retired??false,vocabularyVersion:expansionProductVocabularyVersion};
}
