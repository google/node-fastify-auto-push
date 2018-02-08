# Fastify plugin for HTTP/2 automatic server push

[![Greenkeeper badge](https://badges.greenkeeper.io/google/node-fastify-auto-push.svg)](https://greenkeeper.io/)

**This is not an official Google product.**

[HTTP/2](https://tools.ietf.org/html/rfc7540) is a major revision of the HTTP
protocol. One of its differences from HTTP/1 is [*server
push*](https://tools.ietf.org/html/rfc7540#section-8.2), which allows a
server to pre-emptively send responses to a client in association with a
previous client-initiated request. This can be useful when the server knows
the client will need to have those responses available in order to fully
process the response to the original request.

It sounds simple and easy but is quite tricky for service developers to
manually figure out and configure what resources to push in association with
another resource. There are also many pitfalls the implementors must know
about. See [Rules of Thumb for HTTP/2
Push](https://docs.google.com/document/d/1K0NykTXBbbbTlv60t5MyJvXjqKGsCVNYHyLEXIxYMv0/edit?usp=sharing)
for the details.

This project is for automating server push and getting rid of the need for
manual configurations from service developers. It is a
[fastify](https://www.fastify.io/) plugin that serves static files and is
implemented on top of the
[`h2-auto-push`](https://github.com/google/h2-auto-push) package. It can be
thought as a replacement of the
[`fastify-static`](https://github.com/fastify/fastify-static) plugin that
supports automatic server-push.

For more details, see the `h2-auto-push` package.

**This package currently works only with Node >=9.4.0.**

## How to use

```javascript
import * as fastify from 'fastify';
import {staticServe} from 'fastify-auto-push';
...
const app = fastify({https: {key, cert}, http2: true});
app.register(staticServe, {root: 'path/to/static'});
...
```
