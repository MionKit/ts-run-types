// Regexp-escape helper used by string-format emitters when building
// allowed/disallowed character / value matchers. Mirrors the spec at
// MDN's `RegExp.escape` proposal page; sufficient for the format
// regex shapes mion's run-types ships with.
export function regexpEscape(value: string): string {
  return value.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
