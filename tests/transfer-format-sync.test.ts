/**
 * The mobile app ships a copy of the transfer format module rather than
 * importing it across project boundaries. That copy is the contract between
 * the two applications, so a change to one side that is not mirrored on the
 * other would silently produce packages the desktop cannot read.
 *
 * This test is the thing that catches that.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from './helpers';

test('the desktop and mobile copies of transfer-format.ts are identical', () => {
  const desktop = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/transfer-format.ts'), 'utf-8');
  const mobile = fs.readFileSync(path.join(PROJECT_ROOT, 'mobile/src/transfer-format.ts'), 'utf-8');

  assert.equal(
    mobile,
    desktop,
    'mobile/src/transfer-format.ts has drifted from src/lib/transfer-format.ts — copy the file across',
  );
});
