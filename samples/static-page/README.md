# Sample code using the `fastify-auto-push` plugin

**This is not an official Google product.**

This application is a simple static file server built on top of `fastify` and
`fastify-auto-push`.

## Command-line flags

* `--port <number>` or `-p <number>`

  Specifies the port number to be used. Defaults to 3000.

* `--http2` or `--h2`

  Use HTTP/2 when specified, HTTP/1 otherwise.

* `--auto-push` or `--ap`

  Enable auto-push. Works only with `--http2`.
