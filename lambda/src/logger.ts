import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const rootLogger = pino(
  { level: process.env.LOG_LEVEL ?? 'info' },
  isProduction
    ? undefined
    : pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
);

export function createLogger(module: string): pino.Logger {
  return rootLogger.child({ module });
}

export default rootLogger;
