/** Both callers bind snapshots as s and their library mapping as m. Public live
 * documentation is observed when checked; a dated report keeps its original age.
 * Earlier cache expiry wins over the maximum seven-day guidance window. */
export const currentPracticeSnapshotSql=`
 s.checked_at<=now() AND s.checked_at>=now()-interval '7 days'
 AND s.refresh_after>now()
 AND ((m.source_type='vercel_documentation' AND s.url LIKE 'https://vercel.com/docs/%' AND s.url !~ '[?#]') OR
   (m.published_at IS NOT NULL AND m.published_at<=now()
    AND m.published_at>=now()-interval '7 days'))`;
