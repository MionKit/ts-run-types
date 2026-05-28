// URL format — FormatUrl and the http / file variants. Pattern-based;
// see domain.runtype.ts for the shape rationale.

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';
import {pickSample} from './stringFormat.runtype.ts';

// Mirror mion's URL_REGEXP / URL_HTTP_REGEXP / URL_FILE_REGEXP.
type URL_SRC = '^(?:https?|ftps?|wss?):\\/\\/[^\\s/$.?#-][^\\s]*$';
type URL_HTTP_SRC = '^https?:\\/\\/[^\\s/$.?#-][^\\s]*$';
type URL_FILE_SRC = '^file:\\/\\/\\/?(?:[a-zA-Z]:)?[^\\s/$.?#-][^\\s]*$';

export interface FormatParams_Url {
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
}

export type FormatUrl = TypeFormat<
  string,
  'url',
  {
    pattern: {source: URL_SRC; flags: 'i'};
    mockSamples: ['https://example.com', 'http://mion.io/path', 'ftp://files.example.org'];
    maxLength: 2048;
  },
  'url'
>;
export type FormatUrlHttp = TypeFormat<
  string,
  'url',
  {pattern: {source: URL_HTTP_SRC; flags: 'i'}; mockSamples: ['https://example.com', 'http://mion.io/a/b']; maxLength: 2048},
  'url'
>;
export type FormatUrlFile = TypeFormat<
  string,
  'url',
  {pattern: {source: URL_FILE_SRC; flags: 'i'}; mockSamples: ['file:///etc/hosts', 'file://C:/Users/test/file.txt']; maxLength: 2048},
  'url'
>;

export class URLRunTypeFormat extends BaseRunTypeFormat<FormatParams_Url> {
  static readonly id = 'url' as const;
  readonly name = URLRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_Url>): string {
    return pickSample(annotation.params?.mockSamples) ?? 'https://example.com';
  }

  validateParams(): void {}
}

registerFormatter(new URLRunTypeFormat());
