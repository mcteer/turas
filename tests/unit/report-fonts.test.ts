import {readFile} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
import {reportFontSupportsText,requireReportGlyphs} from '../../lib/server/reports/fonts';
describe('approved static font coverage',()=>{
 it('supports the actual report typography in both bundled fonts',async()=>{
  for(const name of ['Regular','Bold'])expect(reportFontSupportsText(await readFile(`report-templates/fonts/Geist-${name}.ttf`),'Delivery Portfolio · 60.00 hours — Café\nSource and Review Footer')).toBe(true);
 });
 it('blocks unavailable glyphs and hidden control characters instead of accepting fallback fonts',async()=>{
  const font=await readFile('report-templates/fonts/Geist-Regular.ttf');expect(reportFontSupportsText(font,'Unsupported \u{10ffff}')).toBe(false);expect(reportFontSupportsText(font,'Hidden\u0000control')).toBe(false);
  await expect(requireReportGlyphs(['Unsupported \u{10ffff}'])).rejects.toMatchObject({code:'font_unavailable'});await expect(requireReportGlyphs(['Approved readable text'])).resolves.toBeUndefined();
 });
 it('rejects malformed font files without trusting a filename',()=>expect(()=>reportFontSupportsText(Buffer.alloc(20),'text')).toThrow());
});
