import type {readGap} from '../../../lib/server/gaps/service';
type View=Awaited<ReturnType<typeof readGap>>;
export function GapHistory({history}:{history:View['history']}){return <section className="profile-section"><h2>Review History</h2>{history.length?<ol>{history.map(event=><li key={event.id}>{event.action} · <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>{event.selfReview?' · Self-review acknowledged':''}{event.impactId?' · Customer impact':' · Gap narrative'}</li>)}</ol>:<p>No review decisions yet.</p>}</section>;}
