/* ============================================================
   인슈비 AI도우미 — Cloudflare Pages Function
   Claude API 프록시 (API키 서버사이드 보호)
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

export async function onRequestPost(context) {
  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const apiKey = context.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500, headers: corsHeaders
      });
    }

    const body = await context.request.json();
    const userMessage = (body.message || '').trim();

    if (!userMessage) {
      return new Response(JSON.stringify({ error: '메시지를 입력해주세요.' }), {
        status: 400, headers: corsHeaders
      });
    }

    if (userMessage.length > 500) {
      return new Response(JSON.stringify({ error: '메시지가 너무 깁니다. 500자 이내로 입력해주세요.' }), {
        status: 400, headers: corsHeaders
      });
    }

    // 대화 히스토리 (최근 6턴만)
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const messages = [
      ...history,
      { role: 'user', content: userMessage }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      return new Response(JSON.stringify({
        error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      }), { status: 502, headers: corsHeaders });
    }

    const data = await response.json();
    const reply = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return new Response(JSON.stringify({ reply }), {
      status: 200, headers: corsHeaders
    });

  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({
      error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    }), { status: 500, headers: corsHeaders });
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
