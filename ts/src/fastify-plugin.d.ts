declare module 'fastify-plugin' {
  import * as fastify from 'fastify';

  function plugin<T>(fn: fastify.Plugin<T>, version?: string):
      fastify.Plugin<T>;
  export = plugin;
}
