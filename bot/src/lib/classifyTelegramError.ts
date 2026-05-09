import { GrammyError, HttpError } from 'grammy';

// Why: grammY wraps two distinct failure modes that need different operator actions.
//   HttpError   → fetch itself failed (network jitter, Telegram unreachable). Self-heals.
//   GrammyError → Telegram API responded non-200 (permission lost, chat gone). Needs manual fix.
// Pre-fix: sentinel/boot self-check told the operator "re-add admin" even on transient
// HttpError, sending them on a wild goose chase (incident 2026-05-09).
export type SendFailureKind = 'permission' | 'network' | 'unknown';

export interface ClassifiedError {
  kind: SendFailureKind;
  detail: string;
  action: string;
}

export function classifyTelegramError(err: unknown): ClassifiedError {
  if (err instanceof GrammyError) {
    const desc = err.description ?? err.message;
    const isPerm =
      err.error_code === 403 ||
      /not a member|forbidden|kicked|chat not found|have no rights/i.test(desc);
    if (isPerm) {
      return {
        kind: 'permission',
        detail: `Telegram ${err.error_code}: ${desc}`,
        action:
          'open the chat → Manage → Administrators → add @Tradergames_bot with "Post Messages" right.',
      };
    }
    return {
      kind: 'unknown',
      detail: `Telegram ${err.error_code}: ${desc}`,
      action: 'check Telegram BotFather / channel state — non-403 API error.',
    };
  }
  if (err instanceof HttpError) {
    return {
      kind: 'network',
      detail: `Network: ${err.message}`,
      action:
        'usually self-heals; if it persists >1h check Render service health and Telegram API status.',
    };
  }
  return {
    kind: 'unknown',
    detail: (err as Error)?.message ?? String(err),
    action: 'inspect Render logs for stack trace.',
  };
}
