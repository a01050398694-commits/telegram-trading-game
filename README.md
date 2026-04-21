# Telegram Trading Game

텔레그램 기반 실시간 가상 트레이딩 경쟁 게임. PRD는 `PRD.md`, 작업 규칙은 `CLAUDE.md` 참고.

## Structure
```
telegram-trading-game/
├── web/            # Telegram Web App (Vite + React 19 + TS + Tailwind v4)
├── bot/            # Telegram Bot + API server (Node + TS + grammY + Express)
├── PRD.md          # Product requirements
├── CLAUDE.md       # Project coding/communication rules
├── PROGRESS.md     # Session progress log
└── GOTCHAS.md      # Accumulated MUST/MUST NOT rules
```

## Setup
1. `npm install` (root에서 실행, workspaces가 web/bot 동시 설치)
2. `.env.example` → `.env` 복사, `TELEGRAM_BOT_TOKEN` 입력 (@BotFather에서 발급)
3. `npm run dev` — web(5173) + bot(3000) 동시 기동

## Scripts
| 명령 | 설명 |
|---|---|
| `npm run dev` | web + bot 동시 실행 |
| `npm run dev:web` | web 단독 |
| `npm run dev:bot` | bot 단독 |
| `npm run typecheck` | 전체 TS 타입 검사 |
| `npm run build` | 프로덕션 빌드 |

## Stage
- [x] Stage 1: 프로젝트 뼈대 구축
- [ ] Stage 2: 거래소 연동 + 트레이딩 엔진
- [ ] Stage 3: 랭킹 + VIP 채팅
- [ ] Stage 4: 래퍼럴 인증
- [ ] Stage 5: 결제(Telegram Stars)
