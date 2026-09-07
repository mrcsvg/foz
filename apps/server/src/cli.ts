#!/usr/bin/env tsx
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';
import { loadConfig } from './config.js';

/**
 *   pnpm foz auth gmail      # OAuth dance, saves data/gmail-credentials.json
 *   pnpm foz auth slack      # prints how to get a user token
 *   pnpm foz status          # what is configured
 */
const [, , cmd, sub] = process.argv;

async function main() {
  const config = loadConfig();
  if (cmd === 'status') {
    console.log(`root:   ${config.rootDir}`);
    console.log(`port:   ${config.port}`);
    console.log(`demo:   ${config.demo}`);
    console.log(`slack:  ${config.slack.length} account(s)`);
    console.log(`gmail:  ${config.gmail.length} account(s)`);
    return;
  }
  if (cmd === 'auth' && sub === 'slack') {
    console.log(`Slack (user token):
  1. https://api.slack.com/apps → Create New App → From scratch
  2. OAuth & Permissions → User Token Scopes:
       channels:history channels:read groups:history groups:read
       im:history im:read mpim:history mpim:read users:read chat:write
  3. Install to Workspace → copy the "User OAuth Token" (xoxp-…)
  4. Put it in .env:   FOZ_SLACK_TOKEN=xoxp-...   (optional FOZ_SLACK_LABEL="Slack · acme")
     or in foz.config.json: { "slack": [{ "token": "xoxp-...", "label": "acme" }] }
`);
    return;
  }
  if (cmd === 'auth' && sub === 'gmail') {
    const clientId = arg('--client-id') ?? process.env.FOZ_GMAIL_CLIENT_ID;
    const clientSecret = arg('--client-secret') ?? process.env.FOZ_GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.log(`Gmail needs an OAuth client (Desktop app type):
  1. https://console.cloud.google.com → APIs & Services → Enable "Gmail API"
  2. Credentials → Create credentials → OAuth client ID → Desktop app
  3. Run:  pnpm foz auth gmail --client-id <id> --client-secret <secret>
     (or export FOZ_GMAIL_CLIENT_ID / FOZ_GMAIL_CLIENT_SECRET first)`);
      process.exit(1);
    }
    const port = 4322;
    const redirect = `http://127.0.0.1:${port}/oauth/callback`;
    const oauth = new google.auth.OAuth2(clientId, clientSecret, redirect);
    const url = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.modify'],
    });
    console.log(`\nOpen this URL in your browser:\n\n  ${url}\n\nWaiting for Google to call back on ${redirect} …`);
    const code = await new Promise<string>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const u = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        if (u.pathname !== '/oauth/callback') {
          res.writeHead(404).end();
          return;
        }
        const c = u.searchParams.get('code');
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(c ? '<h2>Foz: Gmail connected. You can close this tab.</h2>' : '<h2>Foz: no code received.</h2>');
        server.close();
        c ? resolve(c) : reject(new Error('no code'));
      });
      server.listen(port);
    });
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error('No refresh token returned; revoke access at myaccount.google.com/permissions and retry.');
    oauth.setCredentials(tokens);
    const profile = await google.gmail({ version: 'v1', auth: oauth }).users.getProfile({ userId: 'me' });
    const file = path.join(config.dataDir, 'gmail-credentials.json');
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ clientId, clientSecret, refreshToken: tokens.refresh_token, label: `Gmail · ${profile.data.emailAddress}` }, null, 2));
    console.log(`\nSaved ${file} for ${profile.data.emailAddress}. Restart the server.`);
    return;
  }
  console.log(`foz — commands:
  pnpm foz status
  pnpm foz auth gmail [--client-id ID --client-secret SECRET]
  pnpm foz auth slack`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
