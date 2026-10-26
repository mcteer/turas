import{afterEach,it,expect,vi}from'vitest';
import{ordinaryNativeFileFixtureMaximumMs,waitForNativeFileFixtureCorrection}from'../fixtures/ordinary-native-file-steering';

afterEach(()=>vi.useRealTimers());

it('keeps the simulated generation available beyond preparation and cancels on the actual correction',async()=>{
 vi.useFakeTimers();const controller=new AbortController();let settled=false;
 const pending=waitForNativeFileFixtureCorrection(controller.signal,Date.now()+ordinaryNativeFileFixtureMaximumMs);
 const observed=pending.catch(error=>{settled=true;return error;});
 await vi.advanceTimersByTimeAsync(31000);expect(settled).toBe(false);
 controller.abort();expect(await observed).toMatchObject({name:'AbortError',message:'Generation aborted'});
 expect(vi.getTimerCount()).toBe(0);
});

it('expires at the original absolute fixture deadline, including time already spent preparing',async()=>{
 vi.useFakeTimers();const deadlineAt=Date.now()+ordinaryNativeFileFixtureMaximumMs;
 await vi.advanceTimersByTimeAsync(120000);let settled=false;
 const observed=waitForNativeFileFixtureCorrection(new AbortController().signal,deadlineAt).catch(error=>{settled=true;return error;});
 await vi.advanceTimersByTimeAsync(299999);expect(settled).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect(await observed).toMatchObject({message:'Steering fixture did not receive a correction before its owned deadline'});
 expect(vi.getTimerCount()).toBe(0);
});

it('rejects invalid deadlines before waiting and retires an already aborted generation',async()=>{
 vi.useFakeTimers();const controller=new AbortController();
 for(const deadline of[NaN,Infinity,Date.now(),Date.now()-1,Date.now()+ordinaryNativeFileFixtureMaximumMs+1])expect(()=>waitForNativeFileFixtureCorrection(controller.signal,deadline)).toThrow('Finite owned');
 expect(vi.getTimerCount()).toBe(0);
 controller.abort();await expect(waitForNativeFileFixtureCorrection(controller.signal,Date.now()+1000)).rejects.toMatchObject({name:'AbortError'});
 expect(vi.getTimerCount()).toBe(0);
});
