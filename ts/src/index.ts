// Copyright 2017 The node-fastify-auto-push Authors.
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
import fp from 'fastify-plugin';
import fastifyStatic from 'fastify-static';
import * as autoPush from 'h2-auto-push';
import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import * as stream from 'stream';

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

function isHttp2Response(res: RawResponse): res is http2.Http2ServerResponse {
  return !!(res as http2.Http2ServerResponse).stream;
}

const CACHE_COOKIE_KEY = '__ap_cache__';

const REQ_PATH = Symbol('reqPath');
interface StorePath extends http2.ServerHttp2Stream {
  [REQ_PATH]: string;
}

async function staticServeFn(
    app: fastify.FastifyInstance<HttpServer, RawRequest, RawResponse>,
    opts: AutoPushOptions): Promise<void> {
  const root = opts.root;
  const prefix = opts.prefix || '';
  const ap = new autoPush.AutoPush(root, opts.cacheConfig);

  app.register(fastifyStatic, opts);

  app.addHook('onRequest', async (req, res) => {
    if (isHttp2Request(req)) {
      const reqStream = req.stream;
      const url: string = req.url;
      let reqPath: string = url.split('?')[0];
      reqPath = reqPath.replace(prefix, '');
      (reqStream as StorePath)[REQ_PATH] = reqPath;
      const cookies = cookie.parse(req.headers['cookie'] as string || '');
      const cacheKey = cookies[CACHE_COOKIE_KEY];
      const {newCacheCookie, pushFn} =
          await ap.preprocessRequest(reqPath, reqStream, cacheKey);
      // TODO(jinwoo): Consider making this persistent across sessions.
      res.setHeader(
          'set-cookie', cookie.serialize(CACHE_COOKIE_KEY, newCacheCookie));

      pushFn(reqStream).then(noop, noop);
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const res = reply.res;
    if (isHttp2Response(res)) {
      const resStream = (res as http2.Http2ServerResponse).stream;
      const statusCode = (res as http2.Http2ServerResponse).statusCode;
      if (statusCode === 404) {
        ap.recordRequestPath(
            resStream.session, (resStream as StorePath)[REQ_PATH] || '', false);
      } else if (statusCode < 300 && statusCode >= 200) {
        ap.recordRequestPath(
            resStream.session, (resStream as StorePath)[REQ_PATH] || '', true);
      }
    }
  });
}

function noop() {}

export const staticServe = fp(staticServeFn);
