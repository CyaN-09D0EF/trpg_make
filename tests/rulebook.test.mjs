import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderRulebook} from '../lib/rulebook.mjs';

test('rulebook keeps all fourteen chapters, tables and formula meanings in accessible HTML',async()=>{
  const source=await readFile(new URL('../docs/rulebook.md',import.meta.url),'utf8');
  const html=renderRulebook(source);
  for(const match of source.matchAll(/^## (.+)\r?$/gm))assert.ok(html.includes(match[1].trim()));
  assert.equal((html.match(/class="rulebook-chapter"/g)||[]).length,14);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.equal((html.match(/<math\b/g)||[]).length,3);
  assert.ok(html.includes('월간 신앙'));
  assert.ok(html.includes('생산·소비'));
  assert.ok(html.includes('정착지 단계'));
  assert.ok(html.includes('300~1,000명'));
  assert.ok(html.includes('download="rulebook.md"'));
  assert.ok(!html.includes('class="katex-error"'));
});
test('rulebook rendering escapes raw HTML and rejects executable link URLs',()=>{
  const html=renderRulebook('# 룰북 v0.4\n\n소개\n\n## 제1장. 안전한 규칙\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29) [good](https://example.com)\n');
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('href="https://example.com"'));
});
