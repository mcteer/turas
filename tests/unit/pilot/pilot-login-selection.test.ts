import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {LoginForm} from '../../../app/login/login-form';

it('keeps primary native login available without exposing disabled pilot selection',()=>{
 const html=renderToStaticMarkup(createElement(LoginForm,{}));
 expect(html).toContain('method="post"');
 expect(html).toContain('action="/api/auth/login"');
 expect(html).toContain('name="username"');
 expect(html).toContain('name="password"');
 expect(html).not.toContain('name="workspace"');
 expect(html).not.toContain('Synthetic Pilot');
});

it('has no workspace selector even when a retired environment flag is set',()=>{
 const previous=process.env.TURAS_PILOT_LOGIN_ENABLED;
 try{process.env.TURAS_PILOT_LOGIN_ENABLED='1';const html=renderToStaticMarkup(createElement(LoginForm,{}));expect(html).not.toContain('name="workspace"');expect(html).not.toContain('Synthetic Pilot');}
 finally{if(previous===undefined)delete process.env.TURAS_PILOT_LOGIN_ENABLED;else process.env.TURAS_PILOT_LOGIN_ENABLED=previous;}
});
