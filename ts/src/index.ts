import * as autoPush from 'auto-push';
import * as fs from 'fs';
import * as cookie from 'cookie';
import * as fastify from 'fastify';
import * as http from 'http';
import * as http2 from 'http2';
import fp = require('fastify-plugin');
import * as path from 'path';
import * as mime from 'mime';
import {promisify} from 'util';

export {AssetCacheConfig} from 'auto-push';

const fsStat = promisify(fs.stat);

export interface AutoPushOptions extends fastify.RegisterOptions {
  root: string;
  prefix?: string;
  cacheConfig?: autoPush.AssetCacheConfig;
}

type RawRequest = http.IncomingMessage|http2.Http2ServerRequest;
type RawResponse = http.ServerResponse|http2.Http2ServerResponse;
interface H2Request {
  req: RawRequest;
}
interface H2Response {
  res?: RawResponse;
}
type Request = fastify.FastifyRequest&H2Request;
type Response = fastify.FastifyReply&H2Response;

function isHttp2Request(req: RawRequest): req is http2.Http2ServerRequest {
  return !!(req as http2.Http2ServerRequest).stream;
}

function addCacheHeaders(headers: http2.OutgoingHttpHeaders, stats: fs.Stats):
    void {
  headers['cache-control'] = 'public, max-age=0';
  headers['last-modified'] = stats.mtime.toUTCString();
}

const CACHE_COOKIE_KEY = '__ap_cache__';

function staticServeFn(
    app: fastify.FastifyInstance, opts: AutoPushOptions,
    done?: (err?: Error) => void): void {
  const ap = new autoPush.AutoPush(opts.root, opts.cacheConfig);
  const prefix = opts.prefix || '/';
  app.get(prefix + '*', async (req: Request, res: Response) => {
    if (!isHttp2Request(req.req)) {
      throw new Error('auto-push middleware can only be used with http2');
    }

    const reqPath = req.req.headers[':path'] as string;
    const stream = req.req.stream;
    const cookies = cookie.parse(req.req.headers['cookie'] as string || '');
    const cacheKey = cookies[CACHE_COOKIE_KEY];
    const newCacheKey = await ap.preprocessRequest(reqPath, stream, cacheKey);
    cookies[CACHE_COOKIE_KEY] = newCacheKey;
    // TODO(jinwoo): Consider making this persistent across sessions.
    res.header('set-cookie', cookie.serialize(CACHE_COOKIE_KEY, newCacheKey));

    try {
      const stats = await fsStat(path.join(opts.root, reqPath));
      ap.recordRequestPath(stream.session, reqPath, true);
      const rs = fs.createReadStream(path.join(opts.root, reqPath));
      res.header('content-type', mime.getType(reqPath));
      res.send(rs);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        ap.recordRequestPath(stream.session, reqPath, false);
        res.code(404).send({});
      }
      res.send(err);
    }

    ap.push(stream);
  });

  if (done) done();
}

export const staticServe = fp(staticServeFn);
