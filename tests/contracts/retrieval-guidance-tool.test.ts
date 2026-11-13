import {expect,it} from 'vitest';
import {z} from 'zod';
import {authoredTool} from '../../agent/tools/search_evidence';

it('defaults guidance to current evidence and requires explicit historical intent',()=>{
 const schema=authoredTool.inputSchema as z.ZodType;
 expect(schema.parse({query:'Vercel deployment guidance'})).toMatchObject({use:'current_fact'});
 for(const use of ['accepted_fact','discovery'])expect(schema.parse({query:'Historical deployment evidence',use})).toMatchObject({use});
 expect(schema.safeParse({query:'guidance',use:'ignore_freshness'}).success).toBe(false);
});
