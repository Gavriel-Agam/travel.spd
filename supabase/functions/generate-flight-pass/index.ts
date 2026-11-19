// generate-flight-pass: will build an Apple Wallet boarding pass (.pkpass) for
// a flight booking. Not active: it needs an Apple Pass Type ID certificate,
// its private key and the WWDR certificate as secrets (PASS_CERT_PEM,
// PASS_KEY_PEM, PASS_WWDR_PEM, PASS_TYPE_ID, APPLE_TEAM_ID). The app only
// shows the button when FEATURES.appleWalletPasses is true (src/lib/features.ts).
//
// POST { expense_id } with the person's session -> application/vnd.apple.pkpass
// Until the certificates are set: 501 not_configured.

Deno.serve((req) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const ready = ['PASS_CERT_PEM', 'PASS_KEY_PEM', 'PASS_WWDR_PEM', 'PASS_TYPE_ID', 'APPLE_TEAM_ID'].every((k) => Deno.env.get(k));
  return new Response(JSON.stringify({ error: ready ? 'not_implemented' : 'not_configured' }), { status: 501, headers });
});
