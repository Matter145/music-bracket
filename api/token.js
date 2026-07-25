/* Vercel serverless function: /api/token
 * Returns an app-level Spotify token (Client Credentials).
 * No user login → the 25-user development-mode cap does not apply.
 * The client SECRET stays here on the server, never in the browser.
 *
 * Set these in Vercel → Project → Settings → Environment Variables:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 */
export default async function handler(req, res) {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return res.status(500).json({ error: "Missing Spotify env vars" });

  try {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error_description || "Token request failed" });

    // Tokens last ~1h; cache at the edge so we aren't re-requesting per visitor.
    res.setHeader("Cache-Control", "s-maxage=3000, stale-while-revalidate");
    return res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (e) {
    return res.status(500).json({ error: "Could not reach Spotify" });
  }
}
