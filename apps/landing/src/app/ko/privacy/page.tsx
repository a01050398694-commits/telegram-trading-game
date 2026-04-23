import { LegalPage } from "../../../components/LegalPage";

export const metadata = { title: "개인정보처리방침" };

export default function PrivacyKoPage() {
  return (
    <LegalPage title="개인정보처리방침" lastUpdated="2026-04-23" locale="ko">
      <h2>1. 수집하는 개인정보 항목</h2>
      <ul>
        <li>텔레그램 사용자 ID(숫자 식별자)</li>
        <li>텔레그램 username(공개된 경우) 및 표시 이름</li>
        <li>선호 언어 코드</li>
        <li>시뮬레이션 트레이딩 활동(포지션, 손익, 랭킹)</li>
        <li>리퍼럴 관계(초대자-피초대자)</li>
        <li>이용자가 자발적으로 제출한 거래소 UID(인증 시)</li>
      </ul>

      <h2>2. 수집하지 않는 정보</h2>
      <ul>
        <li>전화번호, 이메일(이용자가 직접 제공하지 않는 한)</li>
        <li>결제 카드 번호(Telegram Stars / InviteMember / Stripe 가 처리)</li>
        <li>텔레그램 내 비공개 대화 및 연락처</li>
        <li>실거래 지갑의 프라이빗 키, 거래소 API 키</li>
      </ul>

      <h2>3. 이용 목적</h2>
      <ul>
        <li>서비스 제공(텔레그램 initData HMAC 검증을 통한 요청 인증).</li>
        <li>일간 랭킹 및 리퍼럴 미션 산정.</li>
        <li>익명 제품 분석(PostHog) 및 오류 추적(Sentry).</li>
      </ul>

      <h2>4. 개인정보의 제3자 제공·처리위탁</h2>
      <p>
        서비스 운영을 위해 아래 수탁사에 필요한 범위 내에서 개인정보 처리를 위탁합니다.
        각 수탁사의 개인정보 처리 조건은 해당 약관을 따릅니다.
      </p>
      <ul>
        <li>Supabase — 데이터베이스 및 호스팅</li>
        <li>Render, Vercel — 컴퓨팅 및 정적 콘텐츠 호스팅</li>
        <li>PostHog — 제품 분석</li>
        <li>Sentry — 오류 추적</li>
        <li>InviteMember — 유료 구독 관리</li>
      </ul>

      <h2>5. 보관 기간 및 파기</h2>
      <p>
        이용자의 텔레그램 ID가 활성 상태인 동안 개인정보를 보관하며, 90일 이상 경과한 랭킹
        스냅샷은 자동 파기됩니다. 이용자가 삭제를 요청하면 법령상 보관 의무가 있는 항목을
        제외하고 지체 없이 파기합니다.
      </p>

      <h2>6. 정보주체의 권리 (PIPA / GDPR / CCPA)</h2>
      <p>
        이용자는 언제든 본인 개인정보의 열람·정정·삭제·처리정지 및 데이터 이전권을 행사할
        수 있습니다. 요청은 텔레그램 <a href="https://t.me/Tradergames_bot">
        t.me/Tradergames_bot</a>을 통해 접수됩니다.
      </p>

      <h2>7. 아동 개인정보</h2>
      <p>
        본 서비스는 만 13세 미만(또는 거주국 법률이 정하는 최소 연령 미만) 아동을 대상으로
        하지 않으며, 해당 연령 미만의 개인정보를 고의로 수집하지 않습니다.
      </p>

      <h2>8. 해외 이전</h2>
      <p>
        운영사의 수탁사(Supabase, Vercel, Render 등)는 대한민국 외 지역에 서버를 둘 수
        있으며, 개인정보보호법 제28조의8에 따라 적정한 보호 조치 하에 해외로 이전됩니다.
      </p>

      <h2>9. 개인정보보호 책임자</h2>
      <p>
        개인정보 관련 문의·불만 처리는 운영팀이 담당하며, 연락 채널은{" "}
        <a href="https://t.me/Tradergames_bot">t.me/Tradergames_bot</a>입니다.
      </p>

      <h2>10. 변경</h2>
      <p>
        본 방침이 변경되는 경우, 시행일 최소 14일 전까지 텔레그램 봇을 통해 공지합니다.
      </p>
    </LegalPage>
  );
}
