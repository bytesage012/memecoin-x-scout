import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('required source and configuration exist',()=>{for(const path of ['config/config.json','backend/server.ts','backend/discovery.ts','backend/x.ts','frontend/index.html'])assert.ok(fs.existsSync(path),path)});
test('configured cross-chain queries',()=>{const c=JSON.parse(fs.readFileSync('config/config.json','utf8'));assert.ok(c.discovery.queries.length>=5);assert.ok(c.discovery.queries.some(q=>q.includes('base')))});