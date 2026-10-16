import {expect,test} from '@playwright/test';
import {signIn} from '../fixtures/ui';

test('unavailable sign-in keeps the form usable and issues no session cookie',async({page})=>{
 await page.goto('/login');
 await page.route('**/api/auth/login',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'unavailable',message:'Service unavailable'}})}));
 await page.getByLabel('Username',{exact:true}).fill('mcteer');
 await page.getByLabel('Password',{exact:true}).fill('synthetic-storage-failure');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.login-form').getByRole('alert')).toHaveText('Service unavailable');
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
 await expect(page.getByLabel('Username',{exact:true})).toBeEditable();
 expect((await page.context().cookies()).filter(cookie=>cookie.name.endsWith('turas_session'))).toEqual([]);
 await expect(page).toHaveURL(/\/login$/);
});

test('New Chat clears an unsent landing draft and the wordmark opens the empty composer',async({page})=>{
 await signIn(page,'mcteer');
 await expect(page.getByRole('textbox',{name:'Message Turi',exact:true})).toBeEditable();
 await page.getByRole('textbox',{name:'Message Turi',exact:true}).fill('Unsent synthetic private draft');
 const mobile=(page.viewportSize()?.width??1440)<768;
 if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await page.getByRole('link',{name:'New Chat',exact:true}).filter({visible:true}).click();
 await expect(page.getByRole('textbox',{name:'Message Turi',exact:true})).toHaveValue('');
 await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
 if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 const brand=page.getByRole('link',{name:'Turas',exact:true}).filter({visible:true});
 await expect(brand).toHaveAttribute('href','/s');
 await brand.click();
 await expect(page).toHaveURL(/\/s$/);
 await expect(page.getByRole('textbox',{name:'Message Turi',exact:true})).toHaveValue('');
});
