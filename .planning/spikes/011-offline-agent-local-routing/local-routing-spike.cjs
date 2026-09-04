/*
 * Isolated proof: a local model is untrusted, emits one allow-listed read-only
 * request, and never receives a database credential or connection string.
 */
const assert = require('node:assert/strict');

const endpoint = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat';
const model = process.env.SPIKE_MODEL || 'qwen3:0.6b';
const todaySales = Object.freeze({ date: 'today', grossCents: 123456, transactions: 37, currency: 'USD' });

const toolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tool', 'arguments'],
  properties: {
    tool: { const: 'reports.today_sales' },
    arguments: {
      type: 'object', additionalProperties: false, required: ['date'],
      properties: { date: { const: 'today' } },
    },
  },
};

function parseToolRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tool request must be an object');
  if (Object.keys(value).length !== 2 || value.tool !== 'reports.today_sales') throw new Error('tool is not allow-listed');
  if (!value.arguments || typeof value.arguments !== 'object' || Array.isArray(value.arguments)) throw new Error('arguments must be an object');
  if (Object.keys(value.arguments).length !== 1 || value.arguments.date !== 'today') throw new Error('invalid arguments');
  return { tool: 'reports.today_sales', arguments: { date: 'today' } };
}

function executeReadOnlyTool(request) {
  assert.deepEqual(request, { tool: 'reports.today_sales', arguments: { date: 'today' } });
  return todaySales;
}

async function localChat(messages, format) {
  const start = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, messages, format, options: { temperature: 0 } }),
  });
  if (!response.ok) throw new Error(`local model HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return { content: payload.message?.content || '', elapsedMs: Math.round(performance.now() - start), evalCount: payload.eval_count, evalDurationNs: payload.eval_duration };
}

function toolPrompt(text) {
  return [
    { role: 'system', content: 'Return only the JSON tool request. The only available tool is reports.today_sales with exactly {"date":"today"}. Do not invent tools, SQL, credentials, or actions.' },
    { role: 'user', content: text },
  ];
}

async function run() {
  const userQuery = process.env.SPIKE_QUERY || 'Show today\'s sales.';
  const requestResult = await localChat(toolPrompt(userQuery), toolSchema);
  const request = parseToolRequest(JSON.parse(requestResult.content));
  const result = executeReadOnlyTool(request);
  const answerResult = await localChat([
    { role: 'system', content: 'Reply as one plain-text sentence in the user\'s language. Use only the result. State gross sales, transaction count, currency, and date. Never output JSON or Markdown.' },
    { role: 'user', content: `User asked: ${userQuery}. Tool result: ${JSON.stringify(result)}` },
  ]);
  const tokensPerSecond = answerResult.evalCount && answerResult.evalDurationNs
    ? Number((answerResult.evalCount / (answerResult.evalDurationNs / 1e9)).toFixed(2)) : null;
  console.log(JSON.stringify({ model, request, result, answer: answerResult.content, metrics: { toolRequestMs: requestResult.elapsedMs, answerMs: answerResult.elapsedMs, answerTokensPerSecond: tokensPerSecond } }, null, 2));
}

function selfCheck() {
  assert.deepEqual(parseToolRequest({ tool: 'reports.today_sales', arguments: { date: 'today' } }), { tool: 'reports.today_sales', arguments: { date: 'today' } });
  assert.throws(() => parseToolRequest({ tool: 'sql.query', arguments: { sql: 'select 1' } }));
  assert.throws(() => parseToolRequest({ tool: 'reports.today_sales', arguments: { date: 'yesterday' } }));
  console.log('local-routing-spike self-check passed');
}

if (require.main === module) {
  if (process.argv.includes('--self-check')) selfCheck();
  else run().catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { parseToolRequest, executeReadOnlyTool };
