import * as fastify from 'fastify';
import * as http from 'http';
import * as http2 from 'http2';
import fp = require('fastify-plugin');
import * as path from 'path';

export interface AutoPushOptions extends fastify.RegisterOptions {
  prefix?: string;
  root: string;
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

function staticServeFn(
    app: fastify.FastifyInstance, opts: AutoPushOptions,
    done?: (err?: Error) => void): void {
  const prefix = opts.prefix || '/';
  app.get(prefix + '*', (req: Request, res: Response) => {
    if (!isHttp2Request(req.req)) {
      throw new Error('Auto-push plugin supports only HTTP/2');
    }
    const reqPath: string = req.req.headers[':path'] as string;
    req.req.stream.respondWithFile(path.join(opts.root, reqPath));
  });
  if (done) done();
}

export const staticServe = fp(staticServeFn);
