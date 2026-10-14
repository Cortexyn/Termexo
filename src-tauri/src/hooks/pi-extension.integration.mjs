// Run with Node 24 and Pi's installed CLI JavaScript entry, e.g.
// node pi-extension.integration.mjs /path/to/pi-coding-agent/dist/bundle/cli.js
// All model requests go to a local fixture server; no cloud credentials are needed.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

assert.ok(
  process.argv[2],
  "Pass the installed Pi CLI JavaScript entry as the first argument",
);
const cli = resolve(process.argv[2]);
const root = mkdtempSync(join(tmpdir(), "termexo-pi-integration-"));
const agent = join(root, "agent");
const project = join(root, "project");
const spool = join(root, "events.jsonl");
const extension = join(root, "extension with 'quotes.mjs");
const fixture = join(project, "fixture with 'quotes.txt");
const marker = join(root, "mcp-connected.txt");
const mcp = join(root, "fake-mcp.mjs");
for (const path of [agent, project]) mkdirSync(path, { recursive: true });
writeFileSync(fixture, "private-tool-output-marker");
writeFileSync(spool, "");
writeFileSync(marker, "");
const template = readFileSync(
  new URL("./pi-extension.mjs", import.meta.url),
  "utf8",
);
writeFileSync(
  extension,
  template
    .replace("__EVENT_FILE__", JSON.stringify(spool))
    .replace("__TERMINAL_ID__", JSON.stringify("real-cli-smoke")),
);
writeFileSync(
  mcp,
  `import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result = {};
  if (request.method === 'initialize') {
    appendFileSync(${JSON.stringify(marker)}, 'initialized\\n');
    result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'termexo-smoke', version: '1' } };
  } else if (request.method === 'tools/list') result = { tools: [] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
});`,
);

let fail = false;
let requests = 0;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body);
  assert.equal(request.url, "/v1/chat/completions");
  requests++;
  if (fail) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: {
          message: "private-error-marker",
          type: "invalid_request_error",
        },
      }),
    );
    return;
  }
  const hasResult = payload.messages.some((message) => message.role === "tool");
  response.writeHead(200, { "content-type": "text/event-stream" });
  const chunk = (delta, finish_reason = null) =>
    response.write(
      "data: " +
        JSON.stringify({
          id: "smoke-response",
          object: "chat.completion.chunk",
          created: 1,
          model: "local",
          choices: [{ index: 0, delta, finish_reason }],
        }) +
        "\n\n",
    );
  if (hasResult) {
    chunk({ role: "assistant", content: "Local smoke test completed." });
    chunk({}, "stop");
  } else {
    chunk({
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: "read-fixture",
          type: "function",
          function: {
            name: "read",
            arguments: JSON.stringify({ path: fixture }),
          },
        },
      ],
    });
    chunk({}, "tool_calls");
  }
  response.end("data: [DONE]\n\n");
});

const records = () =>
  readFileSync(spool, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
async function run(args) {
  const child = spawn(
    process.execPath,
    [
      cli,
      "--offline",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--model",
      "termexo-smoke/local",
      "--extension",
      extension,
      "--mode",
      "json",
      "--print",
      ...args,
    ],
    {
      cwd: project,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agent,
        PI_CODING_AGENT_SESSION_DIR: join(agent, "sessions"),
        PI_TELEMETRY: "0",
        TERMEXO_PI_MCP_CONFIG: JSON.stringify({
          command: process.execPath,
          args: [mcp],
        }),
      },
    },
  );
  // Print mode reads redirected stdin before it starts. Close it once the prompt is supplied.
  child.stdin.end();
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (data) => (stdout += data));
  child.stderr.on("data", (data) => (stderr += data));
  const timeout = setTimeout(() => child.kill(), 30000);
  try {
    const [code] = await once(child, "close");
    assert.equal(code, 0, stderr || "Pi timed out");
    assert.ok(!stderr.includes("Extension error"), stderr);
    assert.ok(!stderr.includes("Failed to load extension"), stderr);
    return stdout.trim().split("\n").filter(Boolean).map(JSON.parse);
  } finally {
    clearTimeout(timeout);
  }
}

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  writeFileSync(
    join(agent, "models.json"),
    JSON.stringify({
      providers: {
        "termexo-smoke": {
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          api: "openai-completions",
          apiKey: "dummy-local-test-key",
          models: [
            {
              id: "local",
              reasoning: false,
              input: ["text"],
              contextWindow: 128000,
              maxTokens: 4096,
            },
          ],
        },
      },
    }),
  );
  writeFileSync(
    join(agent, "settings.json"),
    JSON.stringify({ retry: { enabled: false }, cacheWarming: "off" }),
  );
  const first = await run([
    "--name",
    "Termexo Pi integration smoke",
    "Read the fixture.",
  ]);
  const header = first.find((record) => record.type === "session");
  assert.ok(header?.id);
  assert.ok(
    first.some(
      (record) => record.type === "tool_execution_end" && !record.isError,
    ),
  );
  const events = records();
  const types = events.map((event) => event.payload.event_type);
  for (const type of [
    "session.ready",
    "agent.thinking",
    "tool.started",
    "tool.completed",
    "task.completed",
    "session.ended",
  ]) {
    assert.ok(types.includes(type), `Missing ${type}: ${types}`);
  }
  assert.equal(types.filter((type) => type === "task.completed").length, 1);
  assert.ok(
    events.every((event) => event.payload.native_session_id === header.id),
  );
  assert.ok(
    readFileSync(marker, "utf8").includes("initialized"),
    "Pi must connect our registered MCP server",
  );
  const findSession = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? findSession(join(directory, entry.name))
        : [join(directory, entry.name)],
    );
  const transcript = findSession(join(agent, "sessions")).find(
    (path) => path.endsWith(".jsonl") && path.includes(header.id),
  );
  assert.ok(transcript);
  const native = readFileSync(transcript, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(native[0].cwd, project);
  assert.ok(
    native.some(
      (entry) =>
        entry.type === "session_info" &&
        entry.name === "Termexo Pi integration smoke",
    ),
  );
  const resumed = await run([
    "--session",
    transcript,
    "Continue this session.",
  ]);
  assert.equal(
    resumed.find((record) => record.type === "session").id,
    header.id,
  );
  const beforeFailure = records().length;
  fail = true;
  await run(["A request that must fail."]);
  const failureTypes = records()
    .slice(beforeFailure)
    .map((event) => event.payload.event_type);
  assert.ok(failureTypes.includes("agent.failed"), failureTypes.join(", "));
  assert.ok(
    !failureTypes.includes("task.completed"),
    "A provider failure must not complete the task",
  );
  const text = readFileSync(spool, "utf8");
  for (const secret of [
    "private-tool-output-marker",
    "private-error-marker",
    "dummy-local-test-key",
  ]) {
    assert.ok(
      !text.includes(secret),
      "The spool must not contain provider or tool payloads",
    );
  }
  console.log(
    JSON.stringify(
      {
        result: "passed",
        requests,
        sessionId: header.id,
        checks: [
          "CLI extension load",
          "native session identity",
          "read tool lifecycle",
          "single completion",
          "session resume",
          "provider failure",
          "payload exclusion",
          "native MCP registration",
        ],
      },
      null,
      2,
    ),
  );
  if (process.env.TERMEXO_PI_TEST_KEEP === "1")
    console.log(`Fixtures: ${root}`);
} finally {
  server.closeAllConnections();
  server.close();
  if (process.env.TERMEXO_PI_TEST_KEEP !== "1")
    rmSync(root, { recursive: true, force: true });
}
