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
