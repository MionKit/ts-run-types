// IP-address format — FormatIP and the v4/v6/withPort variants.
// Mirrors mion's IPRunTypeFormat. isType / typeErrors emit lives in
// internal/compiled/typefns/formats/string/ip.go; the cpf_isIPV4 /
// cpf_isIPV6 pure fns ship in type-formats-pure-fns.ts.

import {
  BaseRunTypeFormat,
  registerTypeFormat,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

export interface FormatParams_IP {
  version: 4 | 6 | 'any';
  allowLocalHost?: boolean;
  allowPort?: boolean;
}

type DEFAULT_IP_PARAMS = {version: 'any'; allowLocalHost: true};

export type FormatIP<P extends FormatParams_IP = DEFAULT_IP_PARAMS> = TypeFormat<string, 'ip', P, 'ip'>;
export type FormatIPv4 = FormatIP<{version: 4; allowLocalHost: true}>;
export type FormatIPv6 = FormatIP<{version: 6; allowLocalHost: true}>;
export type FormatIPWithPort = FormatIP<{version: 'any'; allowLocalHost: true; allowPort: true}>;
export type FormatIPv4WithPort = FormatIP<{version: 4; allowLocalHost: true; allowPort: true}>;
export type FormatIPv6WithPort = FormatIP<{version: 6; allowLocalHost: true; allowPort: true}>;

export class IPRunTypeFormat extends BaseRunTypeFormat<FormatParams_IP> {
  static readonly id = 'ip' as const;
  readonly name = IPRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_IP>): string {
    const params = annotation.params ?? {version: 'any'};
    if (params.version === 4) return mockIpV4(params);
    if (params.version === 6) return mockIpV6(params);
    return Math.random() > 0.5 ? mockIpV4(params) : mockIpV6(params);
  }

  validateParams(annotation: FormatAnnotation<FormatParams_IP>): void {
    const version = annotation.params?.version ?? 'any';
    if (version !== 4 && version !== 6 && version !== 'any') {
      throw new Error(`Invalid IP version: ${String(version)}, must be 4, 6, or 'any'`);
    }
  }
}

function mockIpV4(params: FormatParams_IP): string {
  if (params.allowLocalHost && Math.random() > 0.8) return Math.random() > 0.5 ? 'localhost' : '127:0:0:1';
  return Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join('.');
}

function mockIpV6(params: FormatParams_IP): string {
  if (params.allowLocalHost && Math.random() > 0.8) return Math.random() > 0.5 ? '0:0:0:0:0:0:0:1' : '::1';
  return Array.from({length: 8}, () => Math.floor(Math.random() * 0xffff).toString(16)).join(':');
}

registerTypeFormat(new IPRunTypeFormat());
