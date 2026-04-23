import pino from 'pino';

// B-17 — 구조화 로그. 개발 환경은 pino-pretty 로 가독성,
// 프로덕션은 JSON 스트림 그대로 흘려 Render/Datadog 등에 수집.
//
// 주의: console.error 는 기존 코드 곳곳에서 쓰이고 있어 이 모듈은 "새 코드에서만"
// 사용한다. 점진적 마이그레이션을 위해 process.on('unhandledRejection') 도 여기서 hook.

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'trading-bot',
    env: process.env.NODE_ENV ?? 'development',
  },
  // credit card / UID / email 등 PII 는 마스킹. 실제 요구사항에 맞춰 확장.
  redact: {
    paths: ['*.password', '*.token', '*.api_key', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
});

// 전역 unhandledRejection / uncaughtException 캡처.
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
});

// 자식 로거 factory — 서브시스템별 컨텍스트 부여용.
export function childLogger(component: string): pino.Logger {
  return logger.child({ component });
}
