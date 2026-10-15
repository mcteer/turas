import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {parseArtifact} from '../../packages/artifact-extractor/src/main';
import {preflightArtifact} from '../../packages/artifact-extractor/src/preflight';
import {artifactFileTypes} from '../../lib/contracts/artifact-file-types';
import {artifactFileMetadataSchema} from '../../lib/contracts/artifacts';
import {validateArtifactExtraction} from '../../lib/server/artifacts/extraction';
import {documentArchive,openDocument,epubDocument} from '../fixtures/document-archive';

const text='Synthetic delivery evidence';
const textCases=[['json',JSON.stringify({evidence:text}),'txt'],['yaml','evidence: '+text,'txt'],['yml','evidence: '+text,'txt'],['xml','<evidence>'+text+'</evidence>','txt'],['log',text,'txt'],['html','<!DOCTYPE html><html><body><p>'+text+'</p><script>ignoreThisScript()</script></body></html>','document_text'],['rtf','{\\rtf1\\ansi '+text+'}','document_text']] as const;
const files=[...textCases.map(([extension,content,locator])=>({extension,bytes:Buffer.from(content),locator})),
 ...(['odt','ods','odp','odg'] as const).map(extension=>({extension,bytes:documentArchive(openDocument(extension)),locator:'document_text'})),
 {extension:'epub',bytes:documentArchive(epubDocument()),locator:'document_text'}];

it.each(files)('extracts legacy .$extension bytes with honest text provenance and the existing scan binding',async({extension,bytes,locator})=>{
 const filename='synthetic.'+extension,declaredType=artifactFileTypes[extension];
 expect(artifactFileMetadataSchema.safeParse({name:filename,expectedSizeBytes:bytes.length,declaredType,sourcePublishedOn:null,sourceObservedOn:null,rightsNote:'Synthetic test only',audience:'internal',dataCategory:'internal_operations'}).success).toBe(true);
 const originalDigest=createHash('sha256').update(bytes).digest('hex'),scan={contract:'artifact-intake-v1' as const,originalDigest,engineVersion:'synthetic',signatureVersion:'synthetic',scanPolicyVersion:'004-v1',scannedAt:new Date().toISOString(),result:'clean' as const};
 const scanReceiptDigest=createHash('sha256').update(JSON.stringify(scan)).digest('hex'),imageDigest='b'.repeat(64);
 const manifest=await parseArtifact(bytes,filename,declaredType,{imageDigest,scanReceiptDigest});
 expect(manifest.units.some(unit=>unit.text.includes(text))).toBe(true);
 expect(manifest.units.every(unit=>unit.locator.kind===locator)).toBe(true);
 expect(validateArtifactExtraction(manifest,{originalDigest,imageDigest,scanReceipt:scan}).units.length).toBeGreaterThan(0);
 if(extension==='html')expect(manifest.units.map(unit=>unit.text).join('\n')).not.toContain('ignoreThisScript');
});

it('rejects mismatched archive families, encrypted OpenDocument, XML entities and EPUB executable entries',async()=>{
 const odt=openDocument('odt');
 await expect(preflightArtifact(documentArchive(odt),'wrong.ods',artifactFileTypes.ods)).rejects.toMatchObject({code:'type_mismatch'});
 await expect(preflightArtifact(documentArchive({...odt,'META-INF/manifest.xml':'<manifest:encryption-data xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'}),'encrypted.odt',artifactFileTypes.odt)).rejects.toMatchObject({code:'encrypted'});
 await expect(preflightArtifact(documentArchive({...odt,'content.xml':'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><x>&x;</x>'}),'unsafe.odt',artifactFileTypes.odt)).rejects.toMatchObject({code:'xxe'});
 await expect(preflightArtifact(documentArchive({...epubDocument(),'OPS/active.js':'throw Error("never execute")'}),'unsafe.epub',artifactFileTypes.epub)).rejects.toMatchObject({code:'active_content'});
});

it('marks legacy extracted-text truncation as partial instead of inventing complete coverage',async()=>{
 const bytes=Buffer.from('<p>'+text+' '+'a'.repeat(120100)+'</p>');
 const manifest=await parseArtifact(bytes,'large.html',artifactFileTypes.html,{imageDigest:'b'.repeat(64),scanReceiptDigest:'a'.repeat(64)});
 expect(manifest.status).toBe('partial');expect(manifest.coverage.omitted).toContainEqual(expect.objectContaining({kind:'character',reason:'Legacy extracted-text limit'}));
 expect(manifest.units.reduce((sum,item)=>sum+Array.from(item.text).length,0)).toBeLessThanOrEqual(120000);
});
