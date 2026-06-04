#!/usr/bin/env node
/**
 * CMS MCP Hub — CLI
 *
 * Commands:
 *   cms-hub add      --name <n> --url <u> [--token <t>] [--description <d>]
 *   cms-hub list
 *   cms-hub remove   --name <n>
 *   cms-hub refresh  --name <n>
 *   cms-hub status
 *
 * The CLI talks to the running hub over HTTP (default http://localhost:3456).
 * Set HUB_URL env var to point at a different host/port.
 */

import { Command } from 'commander';
import chalk from 'chalk';

const HUB = process.env.HUB_URL ?? 'http://localhost:3456';

async function api(method, path, body) {
  const res = await fetch(`${HUB}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

function statusBadge(s) {
  if (s === 'connected')  return chalk.green('● connected');
  if (s === 'connecting') return chalk.yellow('◌ connecting');
  return chalk.red(`✗ ${s}`);
}

const program = new Command();
program
  .name('cms-hub')
  .description('CMS MCP Hub — connector management CLI')
  .version('1.0.0');

// ── add ─────────────────────────────────────────────────────────────────────
program
  .command('add')
  .description('Add and connect a new CMS connector')
  .requiredOption('-n, --name <name>',   'Unique connector name (e.g. drupal-site-a)')
  .requiredOption('-u, --url <url>',     'Remote MCP server URL (e.g. https://yoursite.com/mcp/sse)')
  .option('-t, --token <token>',         'Bearer token for authentication')
  .option('-d, --description <desc>',   'Human-readable description')
  .action(async (opts) => {
    try {
      const result = await api('POST', '/api/connectors', {
        name: opts.name,
        url: opts.url,
        token: opts.token ?? '',
        description: opts.description ?? '',
      });
      console.log(chalk.bold(`\nConnector "${opts.name}" added`));
      console.log(`  Status:  ${statusBadge(result.status)}`);
      console.log(`  Tools:   ${result.toolCount}`);
      if (result.error) console.log(`  Error:   ${chalk.red(result.error)}`);
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ── list ─────────────────────────────────────────────────────────────────────
program
  .command('list')
  .description('List all registered connectors')
  .action(async () => {
    try {
      const connectors = await api('GET', '/api/connectors');
      if (connectors.length === 0) {
        console.log(chalk.dim('No connectors configured. Use `cms-hub add` to add one.'));
        return;
      }
      console.log('');
      for (const c of connectors) {
        console.log(`${chalk.bold(c.name)}  ${statusBadge(c.status)}  ${chalk.dim(`(${c.toolCount} tools)`)}`);
        console.log(`  ${chalk.dim('URL:')} ${c.url}`);
        if (c.description) console.log(`  ${chalk.dim('Desc:')} ${c.description}`);
        if (c.error) console.log(`  ${chalk.red('Error:')} ${c.error}`);
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message} — is the hub running?`));
      process.exit(1);
    }
  });

// ── remove ───────────────────────────────────────────────────────────────────
program
  .command('remove')
  .description('Disconnect and remove a connector')
  .requiredOption('-n, --name <name>', 'Connector name to remove')
  .action(async (opts) => {
    try {
      await api('DELETE', `/api/connectors/${opts.name}`);
      console.log(chalk.green(`Connector "${opts.name}" removed.`));
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ── refresh ──────────────────────────────────────────────────────────────────
program
  .command('refresh')
  .description('Re-fetch tools from a connector without restarting the hub')
  .requiredOption('-n, --name <name>', 'Connector name to refresh')
  .action(async (opts) => {
    try {
      const result = await api('POST', `/api/connectors/${opts.name}/refresh`);
      console.log(chalk.green(`"${opts.name}" refreshed — ${result.toolCount} tools`));
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ── status ───────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show hub health and connector summary')
  .action(async () => {
    try {
      const h = await api('GET', '/health');
      console.log(`\nHub status: ${chalk.green('running')}`);
      console.log(`Total tools exposed to Claude: ${chalk.bold(h.totalTools)}`);
      console.log(`Connectors: ${h.connectors.length}\n`);
      for (const c of h.connectors) {
        console.log(`  ${chalk.bold(c.name)}  ${statusBadge(c.status)}  ${chalk.dim(`${c.toolCount} tools`)}`);
      }
      console.log('');
    } catch (err) {
      console.error(chalk.red(`Hub not reachable at ${HUB} — is it running?`));
      process.exit(1);
    }
  });

program.parse();
