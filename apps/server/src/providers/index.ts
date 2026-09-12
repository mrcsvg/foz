import type { FozConfig } from '../config.js';
import type { ProviderAdapter } from './types.js';
import { DemoAdapter, demoAccounts } from './demo.js';
import { SlackAdapter } from './slack.js';
import { GmailAdapter } from './gmail.js';

/** Instantiate every adapter the config enables. Add new providers here. */
export function buildAdapters(config: FozConfig): ProviderAdapter[] {
  const adapters: ProviderAdapter[] = [];
  config.slack.forEach((s, i) => adapters.push(new SlackAdapter(`slack-${i + 1}`, s)));
  config.gmail.forEach((g, i) => adapters.push(new GmailAdapter(`gmail-${i + 1}`, g)));
  if (config.demo) {
    const simulate = process.env.FOZ_DEMO_LIVE !== '0';
    for (const acc of demoAccounts()) adapters.push(new DemoAdapter(acc, simulate));
  }
  return adapters;
}
