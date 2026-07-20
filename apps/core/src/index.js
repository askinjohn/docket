/**
 * Local Mail — core placeholder (Phase 0).
 *
 * Phase 1 will replace this with a real HTTP server on 127.0.0.1,
 * SQLite, Gmail OAuth, AI, and MCP.
 *
 * Do not bind to 0.0.0.0 in production code without an explicit security review.
 */

const PORT = Number(process.env.LOCAL_MAIL_CORE_PORT ?? 8787);
const HOST = '127.0.0.1';

console.log(`[local-mail/core] placeholder — Phase 0`);
console.log(`[local-mail/core] planned listen: http://${HOST}:${PORT}`);
console.log(`[local-mail/core] implement health + Gmail in Phase 1 (see ROADMAP.md)`);

process.exit(0);
