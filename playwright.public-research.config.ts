import {defineConfig}from'@playwright/test';import base from './playwright.config';
export default defineConfig({...base,webServer:undefined,testIgnore:[],testMatch:['public-research-coverage.spec.ts']});
