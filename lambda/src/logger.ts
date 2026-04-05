import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const rootLogger = pino(
  { level: 'debug' },
  isProduction
    ? undefined
    : pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
);

export function createLogger(module: string): pino.Logger {
  return rootLogger.child({ module });
}

export default rootLogger;
