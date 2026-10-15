export function getWebUrl(value:string):URL|undefined{
 try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?url:undefined;}catch{return undefined;}
}
export function getFileType(mediaType:string,filename?:string):string{
 if(mediaType==='application/pdf')return 'PDF document';
 if(mediaType==='application/vnd.openxmlformats-officedocument.wordprocessingml.document')return 'Word document';
 if(mediaType.startsWith('image/'))return 'Image';if(mediaType.startsWith('audio/'))return 'Audio';if(mediaType.startsWith('video/'))return 'Video';if(mediaType.startsWith('text/'))return 'Text document';
 const extension=filename?.split('.').at(-1);return filename?.includes('.')&&extension?`${extension.toUpperCase()} file`:'File';
}
export function formatBytes(size:number|undefined):string|undefined{
 if(size===undefined)return undefined;if(size<1024)return `${size} B`;if(size<1024*1024)return `${(size/1024).toFixed(1)} KB`;return `${(size/(1024*1024)).toFixed(1)} MB`;
}
