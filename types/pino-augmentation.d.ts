import 'pino';

declare module 'pino' {
  // Broaden LogFn to accept any extra args to match our usage patterns
  // like: logger.error('msg', obj) or logger.debug('msg', stringified)
  interface LogFn {
    (msg?: any, ...args: any[]): void;
    (obj: any, msg?: any, ...args: any[]): void;
  }
}
