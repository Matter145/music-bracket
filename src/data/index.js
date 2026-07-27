/* Genre database — the app's main driver. Pure local data, no API.
 *
 * TO ADD A GENRE: create a new file in this folder (e.g. pop.js) that
 * does `export default { genre: "Pop", tracks: [...] }`, then add one
 * import line + drop it into the GENRES array below. The picker builds
 * itself from this array, so that's the only change needed.
 *
 * Track shape: { name, sub }  (sub = artist). No IDs or images needed —
 * the app draws monogram tiles when there's no artwork.
 */
import modernIndie from "./modernIndie.js";
import indie2000s from "./indie2000s.js";

export const GENRES = [modernIndie, indie2000s];

// Give every track a stable id so the games can track it.
export function genrePool(genre) {
  return genre.tracks.map((t, i) => ({ id: `${genre.genre}-${i}`, name: t.name, sub: t.sub, img: null }));
}

// Unique artists in a genre, each priced from genre.tiers (default £5).
// Returns null-friendly data used by the Festival game.
export function genreArtists(genre) {
  const tiers = genre.tiers || {};
  const seen = new Map();
  genre.tracks.forEach((t) => { if (t.sub && !seen.has(t.sub)) seen.set(t.sub, { id: "fa-" + seen.size, name: t.sub, price: tiers[t.sub] || 5, img: null }); });
  return [...seen.values()];
}

// Priced artists pooled across several genres (for the Festival game).
// De-dupes by name; if an artist appears in two genres, the higher price wins.
export function combinedArtists(genreList) {
  const seen = new Map();
  genreList.forEach((genre) => {
    const tiers = genre.tiers || {};
    genre.tracks.forEach((t) => {
      if (!t.sub) return;
      const price = tiers[t.sub] || 5;
      if (!seen.has(t.sub) || price > seen.get(t.sub).price) {
        seen.set(t.sub, { name: t.sub, price, img: null });
      }
    });
  });
  return [...seen.values()].map((a, i) => ({ id: "fa-" + i, ...a }));
}
