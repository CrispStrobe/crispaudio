import { describe, expect, it } from 'vitest';
import { thumbnailIntervals } from '../../../src/lib/videoThumbnails';
const tiles = [0, 10, 20, 30].map(time => ({ time, url: `frame-${time}` }));
describe('trimmed picture filmstrips', () => {
  it('covers a clip beginning between samples without an empty leading strip', () => {
    expect(thumbnailIntervals(tiles, 3, 12, 40)).toEqual([
      { time: 0, url: 'frame-0', offset: 0, duration: 7 },
      { time: 10, url: 'frame-10', offset: 7, duration: 5 },
    ]);
  });
  it('shows a preceding sample even when a short clip contains no sample timestamps', () => {
    expect(thumbnailIntervals(tiles, 15, .04, 40)).toEqual([
      { time: 10, url: 'frame-10', offset: 0, duration: expect.closeTo(.04) },
    ]);
  });
  it('crops the last tile to the source and does not paint a past-end interval', () => {
    expect(thumbnailIntervals(tiles, 37, 3, 40)).toEqual([
      { time: 30, url: 'frame-30', offset: 0, duration: 3 },
    ]);
    expect(thumbnailIntervals(tiles, 40, 2, 40)).toEqual([]);
  });
  it('fills a progressive native-only filmstrip until later samples arrive', () => {
    expect(thumbnailIntervals(tiles.slice(0, 1), 4, 12, 40)).toEqual([
      { time: 0, url: 'frame-0', offset: 0, duration: 12 },
    ]);
  });
});
