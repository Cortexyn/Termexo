import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Filled with JSON literals in Termexo's private runtime directory, never in Pi's config.
const eventFile = __EVENT_FILE__;
const terminalId = __TERMINAL_ID__;

export default function termexo(pi) {
  const mcpConfig = process.env.TERMEXO_PI_MCP_CONFIG;
  // Current Pi exposes native MCP registration. Older releases keep the status integration.
  if (mcpConfig && typeof pi.registerMcpServer === 'function') {
    pi.registerMcpServer('termexo-desktop', JSON.parse(mcpConfig));
  }
  let outcome = 'task.completed';
  let completionTimer;
  const clearCompletion = () => {
    clearTimeout(completionTimer);
    completionTimer = undefined;
  };
  const emit = (eventType, ctx, detail = {}) => {
    try {
      appendFileSync(eventFile, JSON.stringify({
        eventKey: randomUUID(), agentType: 'pi', terminalId, receivedAt: Date.now(),
        payload: { native_session_id: ctx.sessionManager.getSessionId(), event_type: eventType, detail },
      }) + '\n');
    } catch (error) {
      // Losing the desktop status feed must not interrupt the agent's work.
      console.error(`Termexo: Could not write the Pi status event: ${error.message}`);
    }
  };
  pi.on('session_start', (_event, ctx) => {
    clearCompletion();
    emit('session.ready', ctx);
  });
  pi.on('session_switch', (_event, ctx) => {
    clearCompletion();
    emit('session.ready', ctx);
  });
  pi.on('agent_start', (_event, ctx) => {
    clearCompletion();
    outcome = 'task.completed';
    emit('agent.thinking', ctx);
  });
  pi.on('tool_execution_start', (event, ctx) => {
    emit('tool.started', ctx, { tool_name: event.toolName });
  });
  pi.on('tool_execution_end', (event, ctx) => {
    emit(event.isError ? 'tool.failed' : 'tool.completed', ctx, { tool_name: event.toolName });
  });
  pi.on('message_end', (event, ctx) => {
    if (event.message.role !== 'assistant') return;
    if (event.message.stopReason === 'error') {
      outcome = 'agent.failed';
      // Provider errors can contain request data; keep the status feed free of their payloads.
    } else if (event.message.stopReason === 'aborted') {
      outcome = 'agent.interrupted';
    } else {
      outcome = 'task.completed';
    }
  });
  pi.on('agent_settled', (event, ctx) => {
    clearCompletion();
    emit(event.aborted ? 'agent.interrupted' : outcome, ctx);
  });
  pi.on('ui_prompt_start', (_event, ctx) => emit('user.input.required', ctx));
  pi.on('ui_prompt_end', (_event, ctx) => emit(ctx.isIdle() ? 'session.ready' : 'agent.thinking', ctx));
  pi.on('agent_end', (_event, ctx) => {
    clearCompletion();
    // agent_end can precede automatic retries or queued prompts. Wait until Pi reports idle.
    // This also supports older Pi releases that do not expose agent_settled.
    completionTimer = setTimeout(() => {
      completionTimer = undefined;
      if (ctx.isIdle()) emit(outcome, ctx);
    }, 0);
  });
  pi.on('session_shutdown', (_event, ctx) => {
    clearCompletion();
    emit('session.ended', ctx);
  });
}
