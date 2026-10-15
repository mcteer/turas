import {crc32} from 'node:zlib';

/** Stored synthetic ZIP entries, no filesystem or external fixtures. */
export function documentArchive(entries:Record<string,string>){
 const body:Buffer[]=[],directory:Buffer[]=[];let offset=0;
 for(const [filename,text] of Object.entries(entries)){
  const name=Buffer.from(filename),data=Buffer.from(text),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  body.push(local,name,data);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  directory.push(central,name);offset+=local.length+name.length+data.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);
 end.writeUInt16LE(directory.length/2,8);end.writeUInt16LE(directory.length/2,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...body,central,end]);
}

export function openDocument(format:'odt'|'ods'|'odp'|'odg',text='Synthetic delivery evidence'){
 const mime={odt:'text',ods:'spreadsheet',odp:'presentation',odg:'graphics'}[format];
 const paragraph='<text:p>'+text+'</text:p>';
 const content=format==='odt'?'<office:text>'+paragraph+'</office:text>':format==='ods'?
  '<office:spreadsheet><table:table table:name="Evidence"><table:table-row><table:table-cell office:value-type="string">'+paragraph+'</table:table-cell></table:table-row></table:table></office:spreadsheet>':
  '<office:'+(format==='odp'?'presentation':'drawing')+'><draw:page draw:name="Evidence"><draw:frame><draw:text-box>'+paragraph+'</draw:text-box></draw:frame></draw:page></office:'+(format==='odp'?'presentation':'drawing')+'>';
 return {mimetype:'application/vnd.oasis.opendocument.'+mime,'content.xml':
  '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" office:version="1.2"><office:body>'+content+'</office:body></office:document-content>'};
}

export function epubDocument(){return {
 mimetype:'application/epub+zip',
 'META-INF/container.xml':'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
 'OPS/book.opf':'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Synthetic evidence</dc:title><dc:identifier id="book">synthetic</dc:identifier><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
 'OPS/chapter.xhtml':'<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Synthetic delivery evidence</p></body></html>',
};}
