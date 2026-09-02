/* ============================================================
   인슈비 AI도우미 — Cloudflare Pages Function
   Claude API 프록시 (API키 서버사이드 보호)
   v8 — 모델명 수정, 디버그 정보 추가, 에러 메시지 개선
   ============================================================ */

const SYSTEM_PROMPT = `당신은 "인슈비 AI도우미"입니다. 보험에 관심 있는 일반 고객을 위한 친절한 보험 안내 도우미입니다.

역할:
- 보험 용어를 쉽게 설명합니다
- 보험 종류(생명보험, 손해보험, 건강보험, 자동차보험, 연금보험 등)의 차이를 안내합니다
- 보험 가입 시 주의사항, 청약철회, 보험금 청구 절차 등을 설명합니다
- 고객이 어떤 보험이 필요한지 일반적인 가이드를 제공합니다

규칙:
- 특정 보험사나 특정 상품을 추천하지 마세요. 일반적인 보험 지식만 안내합니다
- "구체적인 상담은 인슈비에서 검증된 보험설계사를 찾아보세요"라고 자연스럽게 안내하세요
- 의료·법률 조언은 제공하지 마세요
- 한국 보험 제도 기준으로 답변하세요
- 답변은 간결하고 친절하게, 300자 이내로 작성하세요
- 이모지를 적절히 사용해 친근한 느낌을 주세요`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    /* ── 1. API 키 확인 ── */
    const apiKey = context.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return jsonResponse({
        error: 'AI 서비스 준비 중입니다. 잠시 후 다시 시도해주세요.',
        code: 'NO_API_KEY'
      }, 500);
    }

    /* ── 2. 요청 파싱 ── */
    const body = await context.request.json();
    const userMessage = (body.message || '').trim();

    if (!userMessage) {
      return jsonResponse({ error: '메시지를 입력해주세요.' }, 400);
    }
    if (userMessage.length > 500) {
      return jsonResponse({ error: '메시지가 너무 깁니다. 500자 이내로 입력해주세요.' }, 400);
    }

    /* ── 3. 대화 히스토리 (최근 6턴만) ── */
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const messages = [...history, { role: 'user', content: userMessage }];

    /* ── 4. Claude API 호출 ── */
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    /* ── 5. API 에러 처리 ── */
    if (!response.ok) {
      let errDetail = '';
      try { errDetail = await response.text(); } catch (_) {}
      console.error('Claude API error:', response.status, errDetail);

      // 크레딧 소진
      if (response.status === 400 && errDetail.includes('credit')) {
        return jsonResponse({
          error: 'AI 서비스가 일시적으로 제한되었습니다. 아래 자주 묻는 질문을 참고해주세요.',
          code: 'CREDIT_EXHAUSTED'
        }, 502);
      }
      // 인증 오류
      if (response.status === 401) {
        return jsonResponse({
          error: 'AI 서비스 인증에 문제가 있습니다. 관리자에게 문의해주세요.',
          code: 'AUTH_ERROR',
          debug: response.status
        }, 502);
      }
      // 모델 / 요청 오류
      if (response.status === 404 || response.status === 400) {
        return jsonResponse({
          error: 'AI 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.',
          code: 'API_REQUEST_ERROR',
          debug: response.status
        }, 502);
      }
      // 기타
      return jsonResponse({
        error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        code: 'API_ERROR',
        debug: response.status
      }, 502);
    }

    /* ── 6. 정상 응답 파싱 ── */
    const data = await response.json();
    const reply = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return jsonResponse({ reply });

  } catch (err) {
    console.error('Function error:', err.message, err.stack);
    return jsonResponse({
      error: '서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.',
      code: 'FUNCTION_ERROR',
      debug: err.message
    }, 500);
  }
}

// OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
