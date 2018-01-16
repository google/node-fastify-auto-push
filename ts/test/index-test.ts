import test from 'ava';
import * as fastify from 'fastify';
import * as getPort from 'get-port';
import * as http from 'http';
import * as http2 from 'http2';
import * as path from 'path';

import {AutoPushOptions, HttpServer, RawRequest, RawResponse, staticServe} from '../src/index';

function setUpServer(
    app: fastify.FastifyInstance<HttpServer, RawRequest, RawResponse>,
    port: number) {
  app.register<AutoPushOptions>(
      staticServe,
      {root: path.join(__dirname, '..', '..', 'ts', 'test', 'static')});
  app.listen(port, (err) => {
    if (err) throw err;
  });
  return app;
}

function http2FetchFile(port: number, path: string): Promise<string> {
  return new Promise((resolve) => {
    const session = http2.connect(`http://localhost:${port}`);
    const stream = session.request({':path': path});
    stream.setEncoding('utf8');
    stream.on('response', () => {
      let data = '';
      stream
          .on('data',
              (chunk) => {
                data += chunk;
              })
          .on('end', () => {
            resolve(data);
          });
    });
  });
}

function http1FetchFile(port: number, path: string): Promise<string> {
  return new Promise((resolve) => {
    const req = http.request({port, path}, (res) => {
      res.setEncoding('utf8');
      let data = '';
      res.on('data', (chunk) => {
           data += chunk;
         }).on('end', () => {
        resolve(data);
      });
    });
    req.end();
  });
}

test('http2 static file serving', async (t) => {
  const port = await getPort();

  const app = fastify({http2: true});
  setUpServer(app, port);

  const data = await http2FetchFile(port, '/test.html');
  t.true(data.includes('This is a test document.'));
  app.close(() => {});
});

test('http1 static file serving', async (t) => {
  const port = await getPort();

  const app = fastify({http2: false});
  setUpServer(app, port);

  const data = await http1FetchFile(port, '/test.html');
  t.true(data.includes('This is a test document.'));
  app.close(() => {});
});
