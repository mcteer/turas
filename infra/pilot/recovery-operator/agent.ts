import {defineAgent} from 'eve';

// Eve's project/link/deploy entry. The authored build publishes only the
// deterministic backup Function; this agent has no published transport.
export default defineAgent({model:'anthropic/claude-sonnet-5.5',tool:false});
