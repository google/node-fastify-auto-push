// Copyright 2017 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as cookie from 'cookie';
import * as fastify from 'fastify';
import * as autoPush from 'h2-auto-push';
import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import * as send from 'send';
import * as stream from 'stream';

import fp = require('fastify-plugin');

export {AssetCacheConfig} from 'h2-auto-push';

export type HttpServer =
    http.Server|https.Server|http2.Http2Server|http2.Http2SecureServer;
export type RawRequest = http.IncomingMessage|http2.Http2ServerRequest;
export type RawResponse = http.ServerResponse|http2.Http2ServerResponse;
type Request = fastify.FastifyRequest<RawRequest>;
type Response = fastify.FastifyReply<RawResponse>;

export interface AutoPushOptions extends
    fastify.RegisterOptions<HttpServer, RawRequest, RawResponse> {
  root: string;
  prefix?: string;
  cacheConfig?: autoPush.AssetCacheConfig;
}

function isHttp2Request(req: RawRequest): req is http2.Http2ServerRequest {
  return !!(req as http2.Http2ServerRequest).stream;
}

const CACHE_COOKIE_KEY = '__ap_cache__';

function staticServeFn(
    app: fastify.FastifyInstance<HttpServer, RawRequest, RawResponse>,
    opts: AutoPushOptions, done?: (err?: Error) => void): void {
  const root = opts.root;
  let prefix = opts.prefix;
  const ap = new autoPush.AutoPush(root, opts.cacheConfig);

  if (prefix === undefined) prefix = '/';
  if (prefix[0] !== '/') prefix = '/' + prefix;
  if (prefix[prefix.length - 1] !== '/') prefix += '/';
  app.get(prefix + '*', async (req: Request, res: Response) => {
    const reqPath: string = prefix + (req.params['*'] || '');
    if (isHttp2Request(req.req)) {
      const reqStream = req.req.stream;
      const cookies = cookie.parse(req.req.headers['cookie'] as string || '');
      const cacheKey = cookies[CACHE_COOKIE_KEY];
      const newCacheKey =
          await ap.preprocessRequest(reqPath, reqStream, cacheKey);
      // TODO(jinwoo): Consider making this persistent across sessions.
      res.header('set-cookie', cookie.serialize(CACHE_COOKIE_KEY, newCacheKey));

      send(req.req, reqPath, {root})
          .on('error',
              (err) => {
                if (err.code === 'ENOENT') {
                  ap.recordRequestPath(reqStream.session, reqPath, false);
                  res.code(404).send();
                } else {
                  res.code(500).send(err);
                }
              })
          .on('end',
              () => {
                ap.recordRequestPath(reqStream.session, reqPath, true);
              })
          .pipe(res.res as stream.Writable);
      await ap.push(reqStream);
    } else {
      send(req.req, reqPath, {root})
          .on('error',
              (err) => {
                if (err.code === 'ENOENT') {
                  res.code(404).send();
                } else {
                  res.code(500).send(err);
                }
              })
          .pipe(res.res as stream.Writable);
    }
  });

  if (done) done();
}

export const staticServe = fp(staticServeFn);
