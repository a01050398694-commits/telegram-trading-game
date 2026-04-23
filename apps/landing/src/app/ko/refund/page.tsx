import { LegalPage } from "../../../components/LegalPage";

export const metadata = { title: "환불규정" };

export default function RefundKoPage() {
  return (
    <LegalPage title="환불규정" lastUpdated="2026-04-23" locale="ko">
      <h2>1. 적용 범위</h2>
      <p>
        본 규정은 InviteMember를 통해 결제되는 트레이딩 아카데미의 유료 구독(&ldquo;Academy
        월간&rdquo;, &ldquo;Lifetime Academy&rdquo; 및 향후 추가되는 유료 플랜)에 적용됩니다.
        무료 플랜에는 환불 대상이 없습니다.
      </p>

      <h2>2. 7일 청약철회</h2>
      <p>
        최초 결제 후 <strong>7일 이내</strong>에 아래 조건을 모두 충족하는 경우{" "}
        <strong>전액 환불</strong>이 가능합니다.
      </p>
      <ul>
        <li>프리미엄 채널에 입장하지 않았을 것</li>
        <li>Elite Analyst Club 채팅방에 입장하지 않았을 것</li>
        <li>Lifetime 프로모 코드를 발급받거나 사용하지 않았을 것</li>
      </ul>
      <p>
        대한민국 <em>전자상거래법</em>상 디지털 콘텐츠의 청약철회 제한 요건이 적용되며,
        위 권한을 이용자가 행사한 경우 환불권은 소멸됩니다.
      </p>

      <h2>3. 자동 갱신은 환불 불가</h2>
      <p>
        매월 자동 갱신된 결제는 청구 즉시 환불이 제한됩니다. 다음 갱신을 방지하려면 갱신일
        이전에 InviteMember 봇에서 구독을 해지하십시오.
      </p>

      <h2>4. Lifetime 플랜</h2>
      <p>
        Lifetime 플랜(일회성 $7.99 프로모 결제)은 프로모 코드가 발급되거나 사용된 후에는
        환불이 불가합니다. 코드 발급 전이라면 제2조의 7일 규정이 적용됩니다.
      </p>

      <h2>5. 비자발적 환불</h2>
      <ul>
        <li>
          운영사가 서비스를 종료하는 경우, 활성 구독의 미사용 기간에 해당하는 금액을
          일할 환불합니다.
        </li>
        <li>
          지급 분쟁(chargeback)이 제기되어 결제사의 결정으로 확정되면 동일 건에 대해 별도
          환불은 진행되지 않으며, 해당 계정은 정지됩니다.
        </li>
      </ul>

      <h2>6. 환불 요청 방법</h2>
      <ol>
        <li>결제를 처리한 InviteMember 봇과의 텔레그램 대화를 엽니다.</li>
        <li>
          &ldquo;/refund&rdquo;를 입력하고 거래 ID 또는 청구 일자·금액과 함께 간단한 사유를
          기재합니다.
        </li>
        <li>
          InviteMember 측에서 처리가 어려우면{" "}
          <a href="https://t.me/Tradergames_bot">t.me/Tradergames_bot</a>으로 문의하십시오.
          영업일 기준 3일 이내에 회신합니다.
        </li>
      </ol>

      <h2>7. 결제사별 규정</h2>
      <p>
        <strong>Telegram Stars</strong>, <strong>Stripe</strong>,{" "}
        <strong>암호화폐</strong> 각각의 환불 메커니즘은 해당 결제사 약관을 따릅니다. 결제사
        규정이 본 규정과 다른 경우 해당 거래에는 결제사 규정이 우선 적용됩니다.
      </p>

      <h2>8. 강행 소비자보호 권리</h2>
      <p>
        본 규정은 거주국의 강행 소비자보호법(한국 전자상거래법의 청약철회권, EU 원격판매
        규정 등)상의 권리를 제한하지 않습니다.
      </p>
    </LegalPage>
  );
}
