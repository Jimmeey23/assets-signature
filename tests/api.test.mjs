import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { test } from 'node:test';
import * as XLSX from 'xlsx';

process.env.VERCEL = '1';
process.env.MAILTRAP_API_TOKEN = 'test-only-token';
process.env.MAILTRAP_FROM = 'test@example.com';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p57-api-test-'));
process.env.DATA_DIR = path.join(dataDir, 'must-not-be-created');
let captured;
let mode = 'success';
let requests = 0;
https.request = (options, callback) => {
  assert.equal(options.host, 'send.api.mailtrap.io');
  assert.equal(options.headers.Authorization, 'Bearer test-only-token');
  const request = new EventEmitter();
  request.setTimeout = () => {};
  request.write = (body) => { captured = JSON.parse(body); };
  request.end = () => {
    requests++;
    const response = new EventEmitter();
    response.statusCode = mode === 'rejected' ? 401 : 200;
    callback(response);
    queueMicrotask(() => {
      response.emit('data', Buffer.from(JSON.stringify(mode === 'success' ? { success: true } : { success: false, message: 'Test rejection' })));
      response.emit('end');
    });
  };
  return request;
};
const { default: submit } = await import('../api/submit.js');
const { default: health } = await import('../api/health.js');
const pdf = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
const payload = {
  record: {
    ref: 'TEST-1', employeeName: 'Test Employee', employeeId: 'TEST',
    designation: 'Test Role', department: 'Test Department',
    assets: [{ name: 'Test asset' }], signatures: [{ key: 'employee', signed: true }],
  },
  pdf: { filename: 'test.pdf', base64: pdf },
};
async function call(handler, method, body) {
  let result;
  const response = {
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { result = { status: this.status, headers: this.headers, body: JSON.parse(value) }; },
  };
  await handler({ method, body }, response);
  return result;
}
test('Vercel handlers accept parsed bodies, attach PDF and sheet, and never write local state', async () => {
  try {
    assert.equal((await call(submit, 'GET')).status, 405);
    const ready = await call(health, 'GET');
    assert.equal(ready.status, 200);
    assert.equal(ready.body.ledgerMode, 'submission');
    assert.equal(ready.body.submissions, null);
    assert.equal(ready.headers['Cache-Control'], 'no-store');
    assert.equal((await call(submit, 'POST', 'invalid JSON')).status, 400);
    assert.equal((await call(submit, 'POST', { ...payload, record: { ...payload.record, signatures: [] } })).status, 422);
    assert.equal(requests, 0);
    const success = await call(submit, 'POST', payload);
    assert.equal(success.status, 200);
    assert.equal(success.body.sentTo, 'jimmeey@physique57india.com');
    assert.equal(success.body.ledgerMode, 'submission');
    assert.equal(captured.attachments[0].content, pdf);
    assert.equal(captured.to[0].email, 'jimmeey@physique57india.com');
    const workbook = XLSX.read(Buffer.from(captured.attachments[1].content, 'base64'), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Submissions);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].Designation, 'Test Role');
    assert.match(captured.text, /submission details sheet/);
    assert.equal(fs.existsSync(process.env.DATA_DIR), false);
    mode = 'rejected';
    assert.equal((await call(submit, 'POST', payload)).status, 502);
    mode = 'false-success';
    assert.equal((await call(submit, 'POST', payload)).status, 502);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
