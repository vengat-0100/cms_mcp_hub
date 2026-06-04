#!/usr/bin/env node
/**
 * CMS MCP Hub — entry point
 *
 * Usage:
 *   node src/index.js              # default port 3456
 *   PORT=4000 node src/index.js    # custom port
 */

import { ConnectorRegistry } from './connectors/ConnectorRegistry.js';
import { McpHubServer } from './proxy/McpHubServer.js';

const PORT = parseInt(process.env.PORT ?? '3456', 10);

// Simple coloured logger
const logger = {
  info:  (...a) => console.log('\x1b[36m[info]\x1b[0m', ...a),
  warn:  (...a) => console.warn('\x1b[33m[warn]\x1b[0m', ...a),
  error: (...a) => console.error('\x1b[31m[error]\x1b[0m', ...a),
};

async function main() {
  logger.info('CMS MCP Hub starting…');

  const registry = new ConnectorRegistry();
  await registry.initialize(logger);

  const hub = new McpHubServer(registry, { port: PORT, logger });
  await hub.start();

  // Graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      logger.info(`\nShutting down (${sig})…`);
      hub.stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
