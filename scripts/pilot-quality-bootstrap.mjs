import {tsImport} from 'tsx/esm/api';
const {installQualityRuntime}=await tsImport('./pilot-quality-runtime.ts',import.meta.url);
await installQualityRuntime();
