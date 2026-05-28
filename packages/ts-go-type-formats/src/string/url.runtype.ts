// URL format — FormatUrl and the http / file variants. AOT divergence
// noted in url.go: a variant selects the baked-in regex. isType /
// typeErrors emit lives in internal/compiled/typefns/formats/string/url.go.

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

export interface FormatParams_Url {
  variant?: 'standard' | 'http' | 'file';
  maxLength?: number;
  minLength?: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatUrl<P extends FormatParams_Url = {}> = TypeFormat<string, 'url', P, 'url'>;
export type FormatUrlHttp = FormatUrl<{variant: 'http'}>;
export type FormatUrlFile = FormatUrl<{variant: 'file'}>;

const HTTP_SAMPLES = ['https://example.com', 'http://mion.io/path', 'https://sub.test.org/a/b'];
const FILE_SAMPLES = ['file:///etc/hosts', 'file://C:/Users/test/file.txt'];

export class URLRunTypeFormat extends BaseRunTypeFormat<FormatParams_Url> {
  static readonly id = 'url' as const;
  readonly name = URLRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_Url>): string {
    const variant = annotation.params?.variant ?? 'standard';
    const pool = variant === 'file' ? FILE_SAMPLES : HTTP_SAMPLES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  validateParams(annotation: FormatAnnotation<FormatParams_Url>): void {
    const params = annotation.params ?? {};
    if (params.maxLength !== undefined && params.maxLength > 2048) {
      throw new Error('URL maxLength cannot be greater than 2048');
    }
    if (params.minLength !== undefined && params.minLength < 5) {
      throw new Error('URL minLength cannot be less than 5');
    }
  }
}

registerFormatter(new URLRunTypeFormat());
