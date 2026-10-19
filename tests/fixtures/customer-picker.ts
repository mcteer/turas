import type {Page} from '@playwright/test';

export async function selectCustomer(page:Page,name:string){
 await page.getByRole('button',{name:'Customer (optional)',exact:true}).click();
 await page.getByRole('combobox',{name:'Search customers',exact:true}).fill(name);
 await page.getByRole('option',{name,exact:true}).click();
}
