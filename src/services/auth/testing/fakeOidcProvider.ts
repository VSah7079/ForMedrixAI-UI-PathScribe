// src/services/auth/testing/fakeOidcProvider.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-60: TEST INFRASTRUCTURE ONLY — never deployed. A minimal OpenID
// Connect provider, so the real oidc-client-ts (and ssoClient.ts on top of
// it) can be tested end to end without Entra ID or Okta. It does what the
// sign-in uses: discovery, /authorize (signs the chosen account straight
// in, or answers access_denied), /token for authorization_code with PKCE
// S256 (checked) and refresh_token, RS256-signed tokens, CORS.
// Node built-ins only, so it also runs on its own for the browser check:
//   node src/services/auth/testing/fakeOidcProvider.ts 5301
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http';
import { createHash, generateKeyPairSync, createSign, randomBytes } from 'node:crypto';

export interface FakeOidcAccount {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  /** Extra claims (e.g. oid, tid for an Entra-style token). */
  extra?: Record<string, unknown>;
}

export interface FakeOidcProvider {
  issuer: string;
  clientId: string;
  /** The account the next /authorize signs in; null answers access_denied. */
  setAccount(account: FakeOidcAccount | null): void;
  /** Issue ID tokens with this issuer instead (to test the issuer check). */
  setIdTokenIssuer(issuer: string | null): void;
  /** Batch 344: the prompt / max_age / login_hint each /authorize asked for. */
  authorizeRequests(): { prompt: string | null; max_age: string | null; login_hint: string | null; redirect_uri: string | null }[];
  /** Access-token lifetime for the next tokens issued. */
  setAccessTokenLifetime(seconds: number): void;
  tokenRequests(): { grant_type: string; had_verifier: boolean }[];
  close(): Promise<void>;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export async function startFakeOidcProvider(opts: { port?: number; clientId?: string; redirectUriPrefix?: string } = {}): Promise<FakeOidcProvider> {
  const clientId = opts.clientId ?? 'pathscribe-spa';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  let account: FakeOidcAccount | null = { sub: 'user-1', email: 'user@example.org', email_verified: true, name: 'Test User' };
  let idTokenIssuer: string | null = null;
  let accessLifetime = 3600;
  const codes = new Map<string, { challenge: string; redirectUri: string; nonce?: string; account: FakeOidcAccount; scope: string; authTime: number }>();
  const refreshTokens = new Map<string, FakeOidcAccount>();
  const requests: { grant_type: string; had_verifier: boolean }[] = [];
  const authorizeLog: { prompt: string | null; max_age: string | null; login_hint: string | null; redirect_uri: string | null }[] = [];
  let issuer = '';

  const sign = (claims: Record<string, unknown>) => {
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' }));
    const body = b64url(JSON.stringify(claims));
    const s = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey);
    return `${head}.${body}.${b64url(s)}`;
  };

  const tokensFor = (acct: FakeOidcAccount, nonce: string | undefined, withIdToken: boolean, authTime?: number) => {
    const now = Math.floor(Date.now() / 1000);
    const refresh = b64url(randomBytes(24));
    refreshTokens.set(refresh, acct);
    const out: Record<string, unknown> = {
      token_type: 'Bearer',
      access_token: sign({ iss: issuer, aud: 'api://pathscribe', sub: acct.sub, iat: now, exp: now + accessLifetime, scp: 'access_as_user' }),
      expires_in: accessLifetime,
      refresh_token: refresh,
      scope: 'openid profile email offline_access',
    };
    if (withIdToken) {
      out.id_token = sign({
        iss: idTokenIssuer ?? issuer, aud: clientId, sub: acct.sub, iat: now, exp: now + 3600, ...(nonce ? { nonce } : {}), ...(authTime ? { auth_time: authTime } : {}),
        ...(acct.email ? { email: acct.email } : {}), ...(acct.email_verified !== undefined ? { email_verified: acct.email_verified } : {}),
        ...(acct.name ? { name: acct.name } : {}), ...(acct.extra ?? {}),
      });
    }
    return out;
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', issuer || 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const json = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        end_session_endpoint: `${issuer}/logout`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
        id_token_signing_alg_values_supported: ['RS256'],
        subject_types_supported: ['public'],
      });
    }
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });

    if (url.pathname === '/authorize') {
      const q = url.searchParams;
      const redirectUri = q.get('redirect_uri') ?? '';
      authorizeLog.push({ prompt: q.get('prompt'), max_age: q.get('max_age'), login_hint: q.get('login_hint'), redirect_uri: q.get('redirect_uri') });
      if (q.get('client_id') !== clientId || (opts.redirectUriPrefix && !redirectUri.startsWith(opts.redirectUriPrefix))) {
        return json(400, { error: 'invalid_request' });
      }
      const back = new URL(redirectUri);
      const state = q.get('state');
      if (state) back.searchParams.set('state', state);
      if (!account) {
        back.searchParams.set('error', 'access_denied');
        back.searchParams.set('error_description', 'The user cancelled.');
      } else if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) {
        back.searchParams.set('error', 'invalid_request');
        back.searchParams.set('error_description', 'PKCE S256 is required.');
      } else {
        const code = b64url(randomBytes(24));
        // Every /authorize here counts as the user entering their credentials now
        // (auth_time), as prompt=login makes a real provider do.
        codes.set(code, { challenge: q.get('code_challenge')!, redirectUri, nonce: q.get('nonce') ?? undefined, account, scope: q.get('scope') ?? '', authTime: Math.floor(Date.now() / 1000) });
        back.searchParams.set('code', code);
      }
      res.writeHead(302, { Location: back.toString() });
      res.end();
      return;
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        const f = new URLSearchParams(raw);
        const grant = f.get('grant_type') ?? '';
        requests.push({ grant_type: grant, had_verifier: !!f.get('code_verifier') });
        if (f.get('client_id') !== clientId) return json(401, { error: 'invalid_client' });
        if (f.get('client_secret')) return json(400, { error: 'invalid_request', error_description: 'public client: no secret expected' });
        if (grant === 'authorization_code') {
          const entry = codes.get(f.get('code') ?? '');
          codes.delete(f.get('code') ?? '');
          if (!entry || entry.redirectUri !== f.get('redirect_uri')) return json(400, { error: 'invalid_grant' });
          const verifier = f.get('code_verifier') ?? '';
          if (b64url(createHash('sha256').update(verifier).digest()) !== entry.challenge) {
            return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
          }
          return json(200, tokensFor(entry.account, entry.nonce, true, entry.authTime));
        }
        if (grant === 'refresh_token') {
          const acct = refreshTokens.get(f.get('refresh_token') ?? '');
          if (!acct) return json(400, { error: 'invalid_grant' });
          refreshTokens.delete(f.get('refresh_token') ?? '');
          return json(200, tokensFor(acct, undefined, false));
        }
        return json(400, { error: 'unsupported_grant_type' });
      });
      return;
    }
    res.writeHead(404); res.end();
  });

  await new Promise<void>(resolve => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  return {
    issuer,
    clientId,
    setAccount: a => { account = a; },
    setIdTokenIssuer: i => { idTokenIssuer = i; },
    setAccessTokenLifetime: s => { accessLifetime = s; },
    tokenRequests: () => [...requests],
    authorizeRequests: () => [...authorizeLog],
    close: () => new Promise<void>(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

// Run on its own for the browser check.
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 5301);
  const email = process.argv[3] ?? 'schen@hospital.org';
  void startFakeOidcProvider({ port }).then(p => {
    p.setAccount({ sub: `sub-${email}`, email, email_verified: true, name: email });
    console.log(`fake OIDC provider at ${p.issuer} (client ${p.clientId}), signing in ${email}`);
    let seen = 0;
    setInterval(() => { const a = p.authorizeRequests(); for (; seen < a.length; seen++) console.log('authorize:', JSON.stringify(a[seen])); }, 500);
  });
}
