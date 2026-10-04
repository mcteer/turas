import {readFile} from 'node:fs/promises';
import {HttpFailure} from '../../contracts/http';
import {verifiedBundledBrand} from './brand';
import {reportFontSupportsText} from '../../reports/fonts';
export {reportFontSupportsText} from '../../reports/fonts';
export async function requireReportGlyphs(texts:readonly string[]){
 const brand=await verifiedBundledBrand(),fonts=brand.manifest.assets.filter(asset=>/\.(ttf|otf)$/.test(asset.path));
 const text=[...new Set(texts.flatMap(value=>[...value]))].join('');
 try{if(fonts.length<2)throw new Error();for(const font of fonts)if(!reportFontSupportsText(await readFile(font.path),text))throw new Error();}
 catch{throw new HttpFailure(422,'font_unavailable','Report text requires an unsupported glyph or unavailable font');}
}
export function reportDocumentText(value:unknown):string[]{
 if(typeof value==='string')return [value];if(Array.isArray(value))return value.flatMap(reportDocumentText);if(value && typeof value==='object')return Object.values(value).flatMap(reportDocumentText);return [];
}
