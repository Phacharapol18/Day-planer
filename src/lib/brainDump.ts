/**
 * Split a typed or spoken brain dump into separate tasks. Splits on line breaks, bullets, semicolons,
 * sentence ends and spoken connectors ("then", "also", "plus", "and then", "next"), but never on a bare
 * "and" or a comma — "salt and pepper" and "Lunch with Mia, Tom" stay whole.
 */
export function splitBrainDump(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n|;|•|·|(?<=[a-z0-9)])[.!?](?:\s+|$)|,?\s+(?:and then|then|also|plus|next|after that)\s+/i)
    .map((s) => s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\s*(?:i need to|i have to|i should|remember to|don't forget to|dont forget to)\s+/i, '').trim())
    .filter((s) => s.length > 1)
    .slice(0, 30);
}
