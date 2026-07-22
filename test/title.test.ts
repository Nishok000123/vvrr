import assert from 'node:assert/strict';
import test from 'node:test';
import { titleFromMedia } from '../src/shared/title.js';

test('normalizes common release filename noise', () => {
  assert.equal(titleFromMedia('Example.Movie.2025.1080p.WEB-DL.x265.mkv', null), 'Example Movie 2025');
});
