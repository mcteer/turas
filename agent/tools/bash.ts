import { defineDynamic } from "eve/tools";
// Reviewer sessions have no shell surface.
export default defineDynamic({ events: { "session.started": () => null } });
