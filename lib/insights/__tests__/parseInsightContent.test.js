const { parseInsightContent } = require('../parseInsightContent');

describe('parseInsightContent', () => {
  it('uses an already-structured object directly', () => {
    const result = parseInsightContent({
      summary: 'Good week overall.',
      patterns: ['Afternoon highs on weekdays'],
      considerations: ['Consider adjusting lunch insulin timing'],
      doctor_discussion_topics: ['Afternoon ISF'],
    });
    expect(result.structured).toEqual({
      summary: 'Good week overall.',
      patterns: ['Afternoon highs on weekdays'],
      considerations: ['Consider adjusting lunch insulin timing'],
      doctorDiscussionTopics: ['Afternoon ISF'],
    });
  });

  it('unwraps the n8n "Failed to parse model output" fallback shape, stripping the ```json fence', () => {
    const raw =
      '```json\n{\n  "summary": "Time below range was elevated at 12%.",\n  "patterns": [\n    {"observation": "Afternoon highs 2-4pm on 5 of 7 days", "confidence": "High"}\n  ],\n  "considerations": ["Review lunch insulin timing"],\n  "doctor_discussion_topics": ["Carb ratio review"]\n}\n```';
    const result = parseInsightContent({ error: 'Failed to parse model output', raw });
    expect(result.structured).not.toBeNull();
    expect(result.structured.summary).toBe('Time below range was elevated at 12%.');
    expect(result.structured.patterns).toEqual(['Afternoon highs 2-4pm on 5 of 7 days (confidence: High)']);
    expect(result.structured.considerations).toEqual(['Review lunch insulin timing']);
    expect(result.structured.doctorDiscussionTopics).toEqual(['Carb ratio review']);
  });

  it('parses a bare fenced-JSON string with no wrapper object at all', () => {
    const raw = '```json\n{"summary": "All good this week."}\n```';
    const result = parseInsightContent(raw);
    expect(result.structured.summary).toBe('All good this week.');
  });

  it('falls back to a text/message/insight field when there is no summary', () => {
    expect(parseInsightContent({ text: 'plain text insight' }).fallbackText).toBe('plain text insight');
    expect(parseInsightContent({ message: 'another shape' }).fallbackText).toBe('another shape');
  });

  it('falls back to the raw string when nothing parses as JSON', () => {
    const result = parseInsightContent('just a plain sentence, not JSON at all');
    expect(result.structured).toBeNull();
    expect(result.fallbackText).toBe('just a plain sentence, not JSON at all');
  });

  it('falls back to stringified JSON for a completely unrecognized object shape', () => {
    const result = parseInsightContent({ foo: 'bar' });
    expect(result.structured).toBeNull();
    expect(result.fallbackText).toBe(JSON.stringify({ foo: 'bar' }));
  });

  it('never throws on truncated/unparseable raw JSON (e.g. a response cut short by a token limit)', () => {
    const result = parseInsightContent({ error: 'Failed to parse model output', raw: '```json\n{"summary": "cut off mid s' });
    expect(result.structured).toBeNull();
    expect(typeof result.fallbackText).toBe('string');
  });
});
