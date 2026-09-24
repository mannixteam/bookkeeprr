import { searchFrenchCatalog } from '../src/server/integrations/french-catalog/client';
import { resolveCover } from '../src/server/integrations/french-catalog/covers';
const report = [];
for (const query of ['Sacrifice', 'Astérix', 'Les Légendaires', 'One Piece']) {
  try {
    const hits = await searchFrenchCatalog(query);
    const first = hits[0]; const volume = first?.volumes[0];
    const cover = volume ? await resolveCover({ ean: volume.ean, ark: volume.ark, googleId: volume.googleId }) : null;
    report.push({ query, hits: hits.length, first: first?.name, publisher: first?.publisher, contentType: first?.contentType,
      albums: first?.volumes.length, numbered: first?.volumes.filter(v => v.number != null).length,
      cover: cover ? { source: cover.source, bytes: cover.bytes.length } : null });
  } catch (error) { report.push({ query, error: error instanceof Error ? error.message : String(error) }); }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), report }, null, 2));
if (report.every(r => !('hits' in r) || !r.hits)) process.exitCode = 1;
