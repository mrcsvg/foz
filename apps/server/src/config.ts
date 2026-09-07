import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Configuration comes from three layers, later wins:
 *   1. defaults
 *   2. foz.config.json at the repo root (gitignored)
 *   3. environment variables / .env
 *
 * Nothing is required: with zero credentials Foz boots with the demo
 * provider so the UI is fully usable while you sort out tokens.
 */

export interface SlackConfig {
  /** User token (xoxp-…) or bot token (xoxb-…). User tokens post as you. */
  token: string;
  label?: string;
}

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  label?: string;
}

export interface FozConfig {
  port: number;
  dataDir: string;
  rootDir: string;
  demo: boolean;
  pollIntervalMs: number;
  slack: SlackConfig[];
  gmail: GmailConfig[];
}

export function findRootDir(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function loadConfig(): FozConfig {
  const rootDir = findRootDir();
  dotenv.config({ path: path.join(rootDir, '.env') });

  const fileCfg = readJson(path.join(rootDir, 'foz.config.json')) as Partial<{
    port: number;
    demo: boolean;
    pollIntervalMs: number;
    slack: SlackConfig[];
    gmail: GmailConfig[];
  }>;

  const slack: SlackConfig[] = [...(fileCfg.slack ?? [])];
  if (process.env.FOZ_SLACK_TOKEN) slack.push({ token: process.env.FOZ_SLACK_TOKEN, label: process.env.FOZ_SLACK_LABEL });

  const gmail: GmailConfig[] = [...(fileCfg.gmail ?? [])];
  if (process.env.FOZ_GMAIL_CLIENT_ID && process.env.FOZ_GMAIL_CLIENT_SECRET && process.env.FOZ_GMAIL_REFRESH_TOKEN) {
    gmail.push({
      clientId: process.env.FOZ_GMAIL_CLIENT_ID,
      clientSecret: process.env.FOZ_GMAIL_CLIENT_SECRET,
      refreshToken: process.env.FOZ_GMAIL_REFRESH_TOKEN,
      label: process.env.FOZ_GMAIL_LABEL,
    });
  }
  // Credentials saved by `pnpm foz auth gmail`
  const saved = readJson(path.join(rootDir, 'data', 'gmail-credentials.json')) as Partial<GmailConfig>;
  if (saved.clientId && saved.clientSecret && saved.refreshToken && !gmail.some((g) => g.refreshToken === saved.refreshToken)) {
    gmail.push(saved as GmailConfig);
  }

  const demoEnv = process.env.FOZ_DEMO;
  const hasReal = slack.length + gmail.length > 0;
  const demo = demoEnv != null ? demoEnv !== '0' && demoEnv !== 'false' : (fileCfg.demo ?? !hasReal);

  return {
    port: Number(process.env.FOZ_PORT ?? fileCfg.port ?? 4321),
    dataDir: path.join(rootDir, 'data'),
    rootDir,
    demo,
    pollIntervalMs: Number(process.env.FOZ_POLL_MS ?? fileCfg.pollIntervalMs ?? 30_000),
    slack,
    gmail,
  };
}

export function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}
