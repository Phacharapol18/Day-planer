import { describe, it, expect } from 'vitest';
import { splitBrainDump } from './brainDump';

describe('splitBrainDump', () => {
  it('splits lines, bullets and numbered lists', () => {
    expect(splitBrainDump('- Email Dan\n* Taxes 2h !!\n3) Gym 6pm')).toEqual(['Email Dan', 'Taxes 2h !!', 'Gym 6pm']);
  });
  it('splits spoken connectors and sentences, strips filler', () => {
    expect(splitBrainDump('I need to call mom tomorrow then gym at 6pm also buy milk. Remember to book flights')).toEqual([
      'call mom tomorrow',
      'gym at 6pm',
      'buy milk',
      'book flights',
    ]);
    expect(splitBrainDump('write report 2h and then review PRs; lunch at noon')).toEqual(['write report 2h', 'review PRs', 'lunch at noon']);
  });
  it('keeps "and", commas, times and decimals intact', () => {
    expect(splitBrainDump('Buy salt and pepper')).toEqual(['Buy salt and pepper']);
    expect(splitBrainDump('Lunch with Mia, Tom and Ana at 12:30')).toEqual(['Lunch with Mia, Tom and Ana at 12:30']);
    expect(splitBrainDump('Write 1.5h')).toEqual(['Write 1.5h']);
  });
  it('ignores empties and caps runaway input', () => {
    expect(splitBrainDump('\n\n ; . ')).toEqual([]);
    expect(splitBrainDump(Array.from({ length: 50 }, (_, i) => `task ${i}`).join('\n'))).toHaveLength(30);
  });
});
