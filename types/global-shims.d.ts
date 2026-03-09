// Minimal ambient type shims to avoid installing heavy @types in production build

declare module 'express' {
  const exp: any;
  export default exp;
  export type Express = any;
  export type RequestHandler = any;
  export type Request = any;
  export type Response = any;
  export type NextFunction = any;
  export type Router = any;
}

declare module 'cors' {
  const cors: any;
  export default cors;
}

declare module 'compression' {
  const compression: any;
  export default compression;
}

declare module 'node-cron' {
  const nodeCron: any;
  export default nodeCron;
}

declare module 'type-fest' {
  export type PartialDeep<T> = any;
}
