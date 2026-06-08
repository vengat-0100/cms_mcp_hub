#!/usr/bin/env node
import { WorkspaceRegistry } from './workspaces/WorkspaceRegistry.js';
import { McpHubServer }      from './proxy/McpHubServer.js';
import dotenv from 'dotenv';

const env = dotenv.config({path: '.env.dev'}).parsed;

const PORT = parseInt(process.env.PORT ?? env.PORT ?? '3456', 10);

const logger = {
  info:  (...a) => console.log('\x1b[36m[info]\x1b[0m',  ...a),
  warn:  (...a) => console.warn('\x1b[33m[warn]\x1b[0m',  ...a),
  error: (...a) => console.error('\x1b[31m[error]\x1b[0m', ...a),
};

async function main() {
  if (!process.env.ENCRYPTION_KEY || !env.ENCRYPTION_KEY) {
    logger.warn('ENCRYPTION_KEY not set. Generate one with:');
    logger.warn('node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    logger.warn('Then set it in the project environemnt file.');
  }

  logger.info('CMS MCP Hub starting…');

  const workspaceRegistry = new WorkspaceRegistry();
  const hub = new McpHubServer(workspaceRegistry, { port: PORT, logger });
  await hub.start();

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { logger.info(`Shutting down (${sig})…`); hub.stop(); process.exit(0); });
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
