import { describe, it, expect } from 'vitest';
import { GrammyError, HttpError } from 'grammy';
import { classifyTelegramError } from '../lib/classifyTelegramError.js';

// GrammyError requires (message, payload, method, options). Build one with the
// shape the runtime produces so the classifier sees real fields.
function makeGrammyError(error_code: number, description: string): GrammyError {
  return new GrammyError(
    `Call to 'sendChatAction' failed!`,
    { ok: false, error_code, description },
    'sendChatAction',
    {},
  );
}

describe('classifyTelegramError', () => {
  it('classifies HttpError (fetch failure) as network with self-heal action', () => {
    const err = new HttpError("Network request for 'sendChatAction' failed!", new Error('socket hang up'));
    const r = classifyTelegramError(err);
    expect(r.kind).toBe('network');
    expect(r.detail).toContain("Network request for 'sendChatAction' failed!");
    expect(r.action).toMatch(/self-heal/i);
    expect(r.action).not.toMatch(/re-add|administrator/i);
  });

  it('classifies 403 Forbidden as permission and asks to re-add admin', () => {
    const err = makeGrammyError(403, 'Forbidden: bot is not a member of the channel chat');
    const r = classifyTelegramError(err);
    expect(r.kind).toBe('permission');
    expect(r.detail).toContain('403');
    expect(r.detail).toContain('not a member');
    expect(r.action).toMatch(/Administrators/);
    expect(r.action).toMatch(/Post Messages/);
  });

  it('classifies "Bad Request: have no rights" 400 as permission via description regex', () => {
    const err = makeGrammyError(400, 'Bad Request: have no rights to send a message');
    const r = classifyTelegramError(err);
    expect(r.kind).toBe('permission');
    expect(r.action).toMatch(/Post Messages/);
  });

  it('classifies "chat not found" as permission (channel deleted/wrong id)', () => {
    const err = makeGrammyError(400, 'Bad Request: chat not found');
    const r = classifyTelegramError(err);
    expect(r.kind).toBe('permission');
  });

  it('classifies non-permission GrammyError as unknown', () => {
    const err = makeGrammyError(429, 'Too Many Requests: retry after 30');
    const r = classifyTelegramError(err);
    expect(r.kind).toBe('unknown');
    expect(r.detail).toContain('429');
  });

  it('classifies plain Error as unknown without crashing', () => {
    const r = classifyTelegramError(new Error('something exploded'));
    expect(r.kind).toBe('unknown');
    expect(r.detail).toBe('something exploded');
  });

  it('survives non-Error values (string, undefined)', () => {
    expect(classifyTelegramError('boom').kind).toBe('unknown');
    expect(classifyTelegramError(undefined).kind).toBe('unknown');
  });
});
