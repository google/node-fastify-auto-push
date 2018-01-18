// Copyright 2018 Google LLC.
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

const {ArgumentParser} = require('argparse');
const fastify = require('fastify');
const fastifyAutoPush = require('fastify-auto-push');
const fastifyStatic = require('fastify-static');
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');

const {description, version} = require('./package.json');

const argParser = new ArgumentParser({
  version,
  description,
  addHelp: true,
});
argParser.addArgument(['--port', '-p'], {
  type: Number,
  defaultValue: 3000,
  help: 'Port number. Defaults to 3000.',
});
argParser.addArgument(['--http2', '--h2'], {
  nargs: 0,
  help: 'Use HTTP/2. Defaults to true.',
});
argParser.addArgument(['--auto-push', '--ap'], {
  nargs: 0,
  dest: 'autoPush',
  help: 'Enable auto-push. Works only with --http2.',
});
const args = argParser.parseArgs();
if (args.autoPush && !args.http2) {
  console.warn('--auto-push is supported only with --http2. Ignoring.');
  args.autoPush = false;
}

const fsReadFile = promisify(fs.readFile);

const STATIC_DIR = path.join(__dirname, 'static');
const CERTS_DIR = path.join(__dirname, 'certs');

async function createServerOptions() {
  const readCertFile = (filename) => {
    return fsReadFile(path.join(CERTS_DIR, filename));
  };
  const [key, cert] = await Promise.all(
      [readCertFile('server.key'), readCertFile('server.crt')]);
  return {key, cert};
}

async function main() {
  const {key, cert} = await createServerOptions();
  const app = fastify({
    https: {key, cert},
    http2: args.http2,
  });
  if (args.autoPush) {
    // Create and register AutoPush plugin. It should be registered as the first
    // in the middleware chain.
    app.register(fastifyAutoPush.staticServe, {root: STATIC_DIR});
  } else {
    app.register(fastifyStatic, {root: STATIC_DIR});
  }
  app.listen(args.port, (err) => {
    if (err) throw err;
    console.log(`Listening on port ${args.port}`);
  });
}

main().catch((err) => {
  console.error(err);
});
