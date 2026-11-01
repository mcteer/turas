import {it,expect,vi} from 'vitest';
import {deferModelAdmission} from '../../lib/server/models/deferred';
type Model=Extract<Parameters<typeof deferModelAdmission>[0],{specificationVersion:'v4'}>;
it('defers governance until instructions have been assembled and keeps a failed admission closed',async()=>{
 let injected=false;
 const provider=vi.fn(async()=>{throw Error('Provider must not run');});
 const model={specificationVersion:'v4',provider:'synthetic',modelId:'synthetic',supportedUrls:{},doGenerate:provider,doStream:provider} as Model;
 const admit=vi.fn(async()=>{expect(injected).toBe(true);throw Error('Synthetic governed denial');});
 const selected=deferModelAdmission(model,admit);expect(admit).not.toHaveBeenCalled();
 injected=true;
 for(const operation of ['doGenerate','doStream'] as const)await expect(selected[operation]({prompt:[]})).rejects.toThrow('Synthetic governed denial');
 expect(admit).toHaveBeenCalledTimes(1);expect(provider).not.toHaveBeenCalled();
});
