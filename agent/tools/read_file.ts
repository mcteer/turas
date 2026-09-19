import { defineDynamic } from "eve/tools";
// Reviewer sessions have no application filesystem surface.
export default defineDynamic({ events: { "session.started": () => null } });
