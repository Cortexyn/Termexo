import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const directory = mkdtempSync(join(tmpdir(), 'termexo-pi-replay-'));
try {
  const eventFile = join(directory, "events with 'quotes.jsonl");
  const extensionFile = join(directory, 'extension.mjs');
  const template = readFileSync(new URL('./pi-extension.mjs', import.meta.url), 'utf8');
  writeFileSync(extensionFile, template.replace('__EVENT_FILE__', JSON.stringify(eventFile))
    .replace('__TERMINAL_ID__', JSON.stringify('terminal-1')));
  const { default: extension } = await import(pathToFileURL(extensionFile));
  const handlers = new Map();
  const previousConfig = process.env.TERMEXO_PI_MCP_CONFIG;
  process.env.TERMEXO_PI_MCP_CONFIG = JSON.stringify({ command: 'termexo.exe', args: ['mcp-proxy'] });
  let mcpRegistration;
  extension({ on: (event, handler) => handlers.set(event, handler),
    registerMcpServer: (name, config) => { mcpRegistration = { name, config }; } });
  assert.deepEqual(mcpRegistration, { name: 'termexo-desktop', config: { command: 'termexo.exe', args: ['mcp-proxy'] } });
  // A pre-MCP Pi release may still load the extension.
  extension({ on: () => {} });
  if (previousConfig === undefined) delete process.env.TERMEXO_PI_MCP_CONFIG;
  else process.env.TERMEXO_PI_MCP_CONFIG = previousConfig;
  let idle = true;
  let sessionId = 'pi-session-1';
  const ctx = { isIdle: () => idle, sessionManager: { getSessionId: () => sessionId } };
  const fire = async (event, payload = {}) => handlers.get(event)({ type: event, ...payload }, ctx);
  const events = () => readFileSync(eventFile, 'utf8').trim().split('\n').map(JSON.parse);
  const types = () => events().map(event => event.payload.event_type);
  await fire('session_start');
  idle = false;
  await fire('agent_start');
  await fire('tool_execution_start', { toolName: 'read', args: { apiKey: 'secret-value' } });
  await fire('tool_execution_end', { toolName: 'read', isError: true, result: 'secret-value' });
  await fire('agent_end');
  await delay(10);
  assert.equal(types().at(-1), 'tool.failed', 'busy agent_end must not announce completion');
  await fire('message_end', { message: { role: 'assistant', stopReason: 'stop' } });
  await fire('agent_settled', { aborted: false });
  assert.equal(types().at(-1), 'task.completed');
  assert.equal(types().filter(type => type === 'task.completed').length, 1);
  idle = false;
  await fire('agent_start');
  await fire('message_end', { message: { role: 'assistant', stopReason: 'error', errorMessage: 'secret-value' } });
  await fire('agent_end');
  await fire('agent_settled', { aborted: false });
  assert.equal(types().at(-1), 'agent.failed');
  await fire('agent_start');
  await fire('ui_prompt_start');
  assert.equal(types().at(-1), 'user.input.required');
  await fire('ui_prompt_end');
  await fire('agent_settled', { aborted: true });
  assert.equal(types().at(-1), 'agent.interrupted');
  // Legacy Pi: no agent_settled event; the idle check settles after agent_end.
  await fire('agent_start');
  await fire('agent_end');
  idle = true;
  await delay(10);
  assert.equal(types().at(-1), 'task.completed');
  sessionId = 'pi-session-2';
  await fire('session_switch');
  await fire('session_shutdown');
  const recorded = events();
  assert.equal(recorded.at(-1).payload.native_session_id, sessionId);
  assert.equal(recorded.at(-1).payload.event_type, 'session.ended');
  assert.ok(recorded.every(event => event.agentType === 'pi' && event.terminalId === 'terminal-1'));
  assert.equal(new Set(recorded.map(event => event.eventKey)).size, recorded.length);
  assert.ok(!readFileSync(eventFile, 'utf8').includes('secret-value'));
  console.log('Pi extension replay passed: lifecycle, tools, settlement, errors, prompts, interruption, legacy Pi and session routing.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
