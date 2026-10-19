import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {LoginForm} from '../../../app/login/login-form';

it('keeps primary native login available without exposing disabled pilot selection',()=>{
 const html=renderToStaticMarkup(createElement(LoginForm,{workspace:'pilot'}));
 expect(html).toContain('method="post"');
 expect(html).toContain('action="/api/auth/login"');
 expect(html).toContain('name="username"');
 expect(html).toContain('name="password"');
 expect(html).not.toContain('name="workspace"');
 expect(html).not.toContain('Synthetic Pilot');
});

it('offers explicit primary and pilot choices only when enabled',()=>{
 const html=renderToStaticMarkup(createElement(LoginForm,{pilotEnabled:true,workspace:'pilot'}));
 expect(html).toContain('name="workspace"');
 expect(html).toContain('value="primary"');
 expect(html).toContain('value="pilot" selected=""');
});
