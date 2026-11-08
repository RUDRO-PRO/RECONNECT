import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressPhoto } from '../src/photo.js';
test('uploads shrink to 720px, use JPEG 0.75 and meet the encoded 120KB ceiling', async () => {
  const saved = { Image: globalThis.Image, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const calls = []; let attempts = 0, revoked = false;
  globalThis.Image = class { naturalWidth = 3000; naturalHeight = 2000; async decode() {} };
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL(type, quality) { calls.push({ type, quality, width: this.width, height: this.height }); return 'data:image/jpeg;base64,' + 'A'.repeat(++attempts === 1 ? 130000 : 80000); } };
  globalThis.document = { createElement: () => canvas }; URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => { revoked = true; };
  try {
    const result = await compressPhoto({ type: 'image/png', size: 2000000 }, 1400);
    assert.ok(result.length < 120000); assert.equal(calls[0].width, 720); assert.equal(calls[0].height, 480); assert.ok(calls.every(c => c.type === 'image/jpeg' && c.quality === .75)); assert.ok(calls[1].width < 720); assert.equal(revoked, true);
  } finally { globalThis.Image = saved.Image; globalThis.document = saved.document; URL.createObjectURL = saved.create; URL.revokeObjectURL = saved.revoke; }
});
