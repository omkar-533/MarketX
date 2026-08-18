import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeCaptionEntities,
  extractYouTubeUrlFromText,
  extractYouTubeVideoId,
  parseJson3Captions,
  parseTimedTextXml,
  stripYoutubeUrls,
} from './youtubeTranscript.mjs';

describe('youtube id + url', () => {
  it('reads watch, short, and youtu.be links', () => {
    assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9wgxcQ'), 'dQw4w9wgxcQ');
    assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9wgxcQ?t=12'), 'dQw4w9wgxcQ');
    assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9wgxcQ'), 'dQw4w9wgxcQ');
    assert.equal(extractYouTubeVideoId('www.youtube.com/watch?v=dQw4w9wgxcQ'), 'dQw4w9wgxcQ');
    assert.equal(extractYouTubeVideoId('not a video'), null);
  });

  it('pulls a youtube url out of mixed teach text', () => {
    const url = extractYouTubeUrlFromText(
      'Hunt this https://youtu.be/dQw4w9wgxcQ and also 5m volume expansion',
    );
    assert.ok(url.includes('dQw4w9wgxcQ'));
    assert.equal(stripYoutubeUrls('Hunt this https://youtu.be/dQw4w9wgxcQ and 5m volume'), 'Hunt this and 5m volume');
  });
});

describe('caption parsers', () => {
  it('flattens timedtext XML', () => {
    const xml =
      '<transcript><text start="0">Previous low is swept</text><text start="1">then 5m structure turns bullish</text></transcript>';
    assert.match(parseTimedTextXml(xml), /Previous low is swept then 5m structure turns bullish/);
  });

  it('flattens json3 events', () => {
    const json = {
      events: [{ segs: [{ utf8: 'EMA 200 ' }, { utf8: 'cross above' }] }],
    };
    assert.equal(parseJson3Captions(json), 'EMA 200 cross above');
  });

  it('decodes caption entities', () => {
    assert.equal(decodeCaptionEntities('5m &amp; 15m'), '5m & 15m');
  });
});
