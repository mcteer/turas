import AxeBuilder from '@axe-core/playwright';
import {expect,type Page} from '@playwright/test';
import {requireOwnedReportsDatabase} from './environment';
export const reportUiExpect=expect.configure({timeout:30000});
export async function reportUiGuard(){
 if(process.env.TURAS_REPORT_UI_READY!=='1')throw new Error('Use the owned reporting UI runner');
 await requireOwnedReportsDatabase();
}
export async function checkReportAccessibility(page:Page){
 const audit=await new AxeBuilder({page}).analyze();
 expect(audit.violations.filter(item=>['serious','critical'].includes(item.impact??''))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
