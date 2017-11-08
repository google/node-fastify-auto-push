import * as cookie from 'cookie';
import * as fastify from 'fastify';
import * as autoPush from 'h2-auto-push';
import * as http from 'http';
import * as http2 from 'http2';
import fp = require('fastify-plugin');
import * as send from 'send';
import * as stream from 'stream';

export {AssetCacheConfig} from 'h2-auto-push';

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

const CACHE_COOKIE_KEY = '__ap_cache__';

function staticServeFn(
    app: fastify.FastifyInstance, opts: AutoPushOptions,
    done?: (err?: Error) => void): void {
  const root = opts.root;
  let prefix = opts.prefix;
  const ap = new autoPush.AutoPush(root, opts.cacheConfig);

  if (prefix === undefined) prefix = '/';
  if (prefix[0] !== '/') prefix = '/' + prefix;
  if (prefix[prefix.length - 1] !== '/') prefix += '/';
  app.get(prefix + '*', async (req: Request, res: Response) => {
    const reqPath = req.params['*'] || '/';
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
          .on('file',
              () => {
                ap.recordRequestPath(reqStream.session, reqPath, true);
              })
          .pipe(res.res as stream.Writable);
      ap.push(reqStream);
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
