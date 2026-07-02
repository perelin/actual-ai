import { parseLlmResponse } from '../src/utils/json-utils';

describe('parseLlmResponse', () => {
  it('parses a plain JSON response', () => {
    expect(parseLlmResponse('{"type": "skip"}')).toEqual({ type: 'skip' });
  });

  it('parses a fenced JSON response', () => {
    expect(parseLlmResponse('```json\n{"type": "existing", "categoryId": "abc"}\n```'))
      .toEqual({ type: 'existing', categoryId: 'abc' });
  });

  it('parses a bare category id', () => {
    expect(parseLlmResponse('3de93c74-04be-4a32-8131-226f1d0efd69'))
      .toEqual({ type: 'existing', categoryId: '3de93c74-04be-4a32-8131-226f1d0efd69' });
  });

  // Regression: prose reasoning that echoes bracketed note tags ("[enricher]…")
  // made the first-structure-character cut land in the prose, discarding the
  // valid JSON object at the end of the response.
  it('recovers the trailing JSON object from a prose response', () => {
    const prose = 'The `[enricher]` note from the email receipt identifies the item as: '
      + '**"WUBEN G5 LED Taschenlampe"** — a tech gadget purchased on Amazon.\n'
      + '- The amount matches (23.98 EUR)\n\n'
      + '{"type": "existing", "categoryId": "3de93c74-04be-4a32-8131-226f1d0efd69"}';
    expect(parseLlmResponse(prose))
      .toEqual({ type: 'existing', categoryId: '3de93c74-04be-4a32-8131-226f1d0efd69' });
  });

  it('still rejects a response with no JSON object at all', () => {
    expect(() => parseLlmResponse('I cannot categorize this [enricher] transaction.'))
      .toThrow('Invalid response format from LLM');
  });
});
