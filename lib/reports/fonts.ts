/** Read Unicode cmap coverage from reviewed static OpenType files, without font substitution. */
export function reportFontSupportsText(bytes:Buffer,text:string){
 const u16=(at:number)=>bytes.readUInt16BE(at),u32=(at:number)=>bytes.readUInt32BE(at);
 if(bytes.length<12 || ![0x00010000,0x4f54544f].includes(u32(0)))throw new Error('Static OpenType font required');
 const tables=u16(4);if(tables>256 || 12+tables*16>bytes.length)throw new Error('Invalid font table directory');
 let cmap=-1,cmapLength=0;
 for(let index=0;index<tables;index++){const at=12+index*16;if(bytes.toString('ascii',at,at+4)==='cmap'){cmap=u32(at+8);cmapLength=u32(at+12);}}
 if(cmap<0 || cmapLength<4 || cmap+cmapLength>bytes.length)throw new Error('Unicode font map required');
 const count=u16(cmap+2);if(count>256 || 4+count*8>cmapLength)throw new Error('Invalid font map directory');
 const maps:Array<(point:number)=>boolean>=[];
 for(let index=0;index<count;index++){
  const entry=cmap+4+index*8,platform=u16(entry),encoding=u16(entry+2),at=cmap+u32(entry+4);
  if(!(platform===0 || platform===3 && [1,10].includes(encoding)) || at<cmap || at+2>cmap+cmapLength)continue;
  const format=u16(at);
  if(format===12){
   if(at+16>cmap+cmapLength)throw new Error('Invalid Unicode map');const length=u32(at+4),groups=u32(at+12);
   if(length<16 || at+length>cmap+cmapLength || groups>100000 || 16+groups*12>length)throw new Error('Invalid Unicode map');
   const ranges:Array<{start:number;end:number;glyph:number}>=[];let previous=-1;
   for(let group=0;group<groups;group++){const position=at+16+group*12,start=u32(position),end=u32(position+4),glyph=u32(position+8);if(start<=previous || end<start || end>0x10ffff)throw new Error('Invalid Unicode range');ranges.push({start,end,glyph});previous=end;}
   maps.push(point=>{let low=0,high=ranges.length-1;while(low<=high){const mid=(low+high)>>1,range=ranges[mid];if(point<range.start)high=mid-1;else if(point>range.end)low=mid+1;else return range.glyph+point-range.start!==0;}return false;});
  }else if(format===4){
   if(at+16>cmap+cmapLength)throw new Error('Invalid Unicode map');const length=u16(at+2),segments=u16(at+6)/2;
   if(!Number.isInteger(segments) || segments<1 || 16+segments*8>length || at+length>cmap+cmapLength)throw new Error('Invalid Unicode map');
   const endAt=at+14,startAt=endAt+segments*2+2,deltaAt=startAt+segments*2,offsetAt=deltaAt+segments*2;
   maps.push(point=>{
    if(point>65535)return false;
    for(let segment=0;segment<segments;segment++){
     const end=u16(endAt+segment*2);if(point>end)continue;const start=u16(startAt+segment*2);if(point<start)return false;
     const delta=bytes.readInt16BE(deltaAt+segment*2),offset=u16(offsetAt+segment*2);if(!offset)return ((point+delta)&65535)!==0;
     const glyphAt=offsetAt+segment*2+offset+(point-start)*2;if(glyphAt<at || glyphAt+2>at+length)throw new Error('Invalid glyph reference');
     const glyph=u16(glyphAt);return glyph!==0 && ((glyph+delta)&65535)!==0;
    }return false;
   });
  }
 }
 if(!maps.length)throw new Error('Unicode font map required');
 for(const character of text){const point=character.codePointAt(0)!;if([9,10,13].includes(point))continue;if(point<32 || point===127 || !maps.some(map=>map(point)))return false;}
 return true;
}
