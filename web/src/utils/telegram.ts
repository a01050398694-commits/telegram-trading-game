// Stage 8.4 — Telegram WebApp 네이티브 피드백/공유 레이어 (Desktop Ultimate Fallback).
//
// 왜 Stage 8.4 에서 다시 고쳤나:
//   · Stage 8.3 의 `<a download>` 임시 앵커 방식이 Telegram Desktop WebView 에서 silent 하게
//     차단되어 "아무 일도 안 일어나는" 증상 재발. CEO 지시 "PC 핑계 대지 말고 무조건".
//   · Chromium 기반 데스크톱은 `navigator.clipboard.write([ClipboardItem])` 로 이미지 자체를
//     클립보드에 복사 가능 (이 API는 Telegram Desktop WebView 에서도 대부분 열려 있음).
//   · ClipboardItem 조차 거부되면 마지막 폴백으로 `'manual-save'` 반환 → 컴포넌트가
//     풀스크린 모달에 `<img>` 를 렌더해서 유저가 직접 우클릭 → Copy/Save image.
//
// 호출 우선순위:
//   1) 모바일 네이티브 시트: `navigator.canShare({files:[file]})` 가 true 일 때만.
//   2) 데스크톱 clipboard 이미지: `navigator.clipboard.write([ClipboardItem({image/png, text/plain})])`.
//   3) 최종 폴백: `'manual-save'` → 컴포넌트가 이미지 모달 렌더.
//   4) (텍스트 전용) Telegram inline 공유 → clipboard.writeText → 'none'.

type HapticImpact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type HapticNotification = 'success' | 'error' | 'warning';

function getTg(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

// ---------- Haptic ----------
export function hapticImpact(style: HapticImpact = 'medium'): void {
  try {
    getTg()?.HapticFeedback?.impactOccurred(style);
  } catch {
    /* unsupported — ignore */
  }
}

export function hapticNotification(type: HapticNotification): void {
  try {
    getTg()?.HapticFeedback?.notificationOccurred(type);
  } catch {
    /* ignore */
  }
}

export function hapticSelection(): void {
  try {
    getTg()?.HapticFeedback?.selectionChanged();
  } catch {
    /* ignore */
  }
}

// ---------- Share ----------

export type ShareResult =
  | 'navigator-share' // 모바일: iOS/Android 공유 시트
  | 'clipboard-image' // 데스크톱: 이미지+텍스트 클립보드 복사
  | 'manual-save'     // 최종 폴백: 컴포넌트가 이미지 모달을 직접 렌더해야 함
  | 'tg-inline'       // blob 없는 텍스트 전용
  | 'clipboard'       // 텍스트 전용 복사
  | 'none';

export async function shareROI(args: {
  text: string;
  blob?: Blob | null;
  filename?: string;
}): Promise<ShareResult> {
  const { text, blob, filename = 'roi.png' } = args;
  const tg = getTg();

  // `canShare({files})` 가 함수 존재 + true 반환 모두 만족할 때만 mobile 판정.
  const canShareFiles = (file: File): boolean => {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
      share?: (d: ShareData) => Promise<void>;
    };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
      return nav.canShare({ files: [file] });
    } catch {
      return false;
    }
  };

  if (blob) {
    const file = new File([blob], filename, { type: blob.type || 'image/png' });

    // 1) 모바일 네이티브 공유 시트
    if (canShareFiles(file)) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          files: [file],
          text,
        });
        return 'navigator-share';
      } catch {
        // 유저 취소 또는 실패 → 데스크톱 경로 시도
      }
    }

    // 2) 데스크톱 clipboard 이미지 — PLAN.md §8.4 Task 1 핵심.
    //    ClipboardItem 에 image/png 와 text/plain 을 동시에 넣어서,
    //    카톡/텔레그램/트위터 에디터가 이미지 또는 텍스트 어느 쪽이든 paste 가능.
    //    Telegram Desktop WebView 에서 대부분 열려 있는 API.
    try {
      const ClipboardItemCtor = (window as Window & { ClipboardItem?: typeof ClipboardItem })
        .ClipboardItem;
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItemCtor === 'function'
      ) {
        const textBlob = new Blob([text], { type: 'text/plain' });
        const item = new ClipboardItemCtor({
          'image/png': blob,
          'text/plain': textBlob,
        });
        await navigator.clipboard.write([item]);
        return 'clipboard-image';
      }
    } catch {
      // permission denied / unsupported → manual-save 로 폴백
    }

    // 3) 최종 폴백 — 텍스트는 미리 복사해 놓고, 이미지 모달 렌더는 컴포넌트에 위임.
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* ignore */
    }
    return 'manual-save';
  }

  // blob 없는 경로 — 예전 텍스트 전용 공유.

  // 4) Telegram 내부 inline 공유
  if (tg?.switchInlineQuery) {
    try {
      tg.switchInlineQuery(text, ['users', 'groups', 'channels']);
      return 'tg-inline';
    } catch {
      /* fall through */
    }
  }

  // 5) clipboard 텍스트
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      try {
        tg?.showPopup?.({
          title: '복사 완료',
          message: '공유 문구를 클립보드에 복사했습니다. Telegram 채팅에 붙여넣기.',
          buttons: [{ type: 'ok' }],
        });
      } catch {
        /* showPopup 미지원 */
      }
      return 'clipboard';
    }
  } catch {
    /* ignore */
  }

  return 'none';
}

export function isInsideTelegram(): boolean {
  return getTg() !== null;
}

export function openTelegramLinkSafe(url: string): void {
  const tg = getTg();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
