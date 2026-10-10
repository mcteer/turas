import { testMcp } from './test-mcp';
/** Consumer acceptance includes the complete domain manifest and actual SDK
 * calls in a production app; no partial or filtered consumer proof. */
if(process.argv.length!==2)throw Error('MCP consumer acceptance takes no overrides');
await testMcp();
