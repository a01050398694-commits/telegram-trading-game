import { LegalPage } from "../../../components/LegalPage";

export const metadata = { title: "쿠키정책" };

export default function CookiesKoPage() {
  return (
    <LegalPage title="쿠키정책" lastUpdated="2026-04-23" locale="ko">
      <h2>쿠키란</h2>
      <p>
        쿠키는 웹사이트가 이용자의 기기에 저장하는 작은 파일입니다. 본 랜딩페이지는 아래
        목적에 한해 최소한의 쿠키와 브라우저 저장소를 사용합니다.
      </p>

      <h2>사용 중인 쿠키 및 저장소</h2>
      <ul>
        <li>
          <strong>PostHog</strong> — 익명 제품 분석(페이지뷰, 클릭 이벤트, 성능 지표).
          IP 주소는 절단(truncate) 처리됩니다.
        </li>
        <li>
          <strong>Next.js 세션</strong> — 언어 설정 등 UI 상태 유지용 기술적 쿠키.
        </li>
        <li>
          <strong>Sentry</strong> — 세션 리플레이는 기본 비활성화. 오류 발생 시 스택 트레이스만
          전송됩니다.
        </li>
      </ul>

      <h2>제3자 쿠키</h2>
      <p>
        본 사이트에는 제3자 광고 네트워크가 존재하지 않습니다. 텔레그램으로 이동하는 링크를
        클릭하면 그 시점부터 텔레그램의 자체 개인정보·쿠키 정책이 적용됩니다.
      </p>

      <h2>쿠키 비활성화</h2>
      <p>
        브라우저 설정에서 쿠키를 차단할 수 있습니다. 차단 시에도 본 랜딩페이지는 정상
        동작하며, 일부 분석 이벤트만 수집되지 않습니다. 텔레그램 미니앱 자체는 브라우저
        쿠키를 사용하지 않으며, 텔레그램 WebView는 세션 간 쿠키를 유지하지 않습니다.
      </p>
    </LegalPage>
  );
}
