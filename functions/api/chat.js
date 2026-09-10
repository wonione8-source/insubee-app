/**
 * 인슈비 AI도우미 — Cloudflare Pages Function
 * v8.1 Debug — 단계별 에러 격리로 502 원인 특정
 * 
 * 디버그 모드: POST /api/chat {"message":"__debug__"} 로 환경 테스트 가능
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: CORS_HEADERS });
}

/* ── FAQ 폴백 (API 없이도 동작) ── */
function checkFAQ(msg) {
  var m = msg.toLowerCase();
  var faqs = [
    { k: ["실손", "실비"], a: "실손의료보험은 실제 의료비를 보장하는 보험입니다. 2024년부터 4세대 실손보험이 판매되고 있으며, 급여/비급여 구분 보장에 자기부담금 비율이 달라집니다. 기존 실손보험을 갖고 계신다면 전환 여부를 설계사와 상담해보세요." },
    { k: ["자동차", "차보험", "자보"], a: "자동차보험은 의무보험(대인/대물)과 선택보험(자기신체, 자기차량 등)으로 구성됩니다. 보험료는 차종, 연령, 사고이력에 따라 달라지며, 비교견적 후 가입하시는 것을 권합니다. 인슈비에서 자동차보험 전문 설계사를 찾아보세요!" },
    { k: ["종신", "사망"], a: "종신보험은 피보험자 사망 시 유족에게 보험금을 지급합니다. 가장의 경제적 책임이 큰 시기에 가입하는 것이 일반적이며, 보장 금액과 보험료를 설계사와 상담하여 결정하세요." },
    { k: ["연금", "노후", "은퇴"], a: "연금보험은 노후 생활자금을 준비하는 보험입니다. 세액공제 혜택이 있는 연금저축보험과 비과세 혜택이 있는 일반 연금보험이 있습니다. 가입 시기가 빠를수록 유리합니다." },
    { k: ["암보험", "암"], a: "암보험은 암 진단 시 진단금과 치료비를 보장합니다. 소액암/유사암/일반암/고액암 등 분류에 따라 보장금액이 다르므로 보장 범위를 꼼꼼히 확인하세요." },
    { k: ["인슈비", "insub", "서비스", "뭐하는"], a: "인슈비(InsuBee)는 보험 고객과 검증된 보험설계사를 연결하는 플랫폼입니다. 원하는 조건으로 설계사를 검색하고, 무료로 상담을 요청할 수 있어요!" },
    { k: ["안녕", "하이", "hello", "hi"], a: "안녕하세요! 인슈비 AI 보험 도우미입니다 🐝 보험에 관한 궁금한 점이 있으시면 무엇이든 물어보세요!" },
  ];
  for (var i = 0; i < faqs.length; i++) {
    for (var j = 0; j < faqs[i].k.length; j++) {
      if (m.indexOf(faqs[i].k[j]) !== -1) return faqs[i].a;
    }
  }
  return null;
}

/* ── POST 핸들러 ── */
export async function onRequestPost(context) {
  // 최상위 방어: 절대 크래시하지 않도록
  try {
    return await handlePost(context);
  } catch (outerErr) {
    try {
      return json({
        error: "서버 내부 오류 (outer catch)",
        step: "outer",
        message: String(outerErr),
        stack: outerErr && outerErr.stack ? outerErr.stack.substring(0, 300) : null,
      }, 500);
    } catch (_) {
      return new Response('{"error":"critical failure"}', {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
}

async function handlePost(context) {

  /* ── Step 0: env 접근 ── */
  var apiKey;
  try {
    apiKey = context.env.ANTHROPIC_API_KEY;
  } catch (e) {
    return json({ step: "0-env", error: "env 접근 실패: " + e.message }, 500);
  }

  if (!apiKey) {
    return json({ step: "0-env", error: "ANTHROPIC_API_KEY 미설정" }, 500);
  }

  /* ── Step 1: body 파싱 ── */
  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ step: "1-body", error: "요청 파싱 실패: " + e.message }, 400);
  }

  var userMessage = (body && body.message) ? String(body.message).trim() : "";

  if (!userMessage) {
    return json({ step: "1-validate", error: "message 비어있음" }, 400);
  }

  /* ── Step D: 디버그 모드 ── */
  if (userMessage === "__debug__") {
    return json({
      debug: true,
      version: "v8.1",
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey.substring(0, 10) + "...",
      apiKeyLength: apiKey.length,
      timestamp: new Date().toISOString(),
    }, 200);
  }

  /* ── Step 2: FAQ 체크 ── */
  try {
    var faqAnswer = checkFAQ(userMessage);
    if (faqAnswer) {
      return json({ reply: faqAnswer, source: "faq" }, 200);
    }
  } catch (e) {
    // FAQ 실패해도 진행
  }

  /* ── Step N: 네트워크 테스트 모드 ── */
  if (userMessage === "__nettest__") {
    try {
      var testResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "invalid-key-for-test",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 10,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      return json({
        debug: true,
        nettest: "fetch 성공 (응답 도달)",
        status: testResp.status,
        statusText: testResp.statusText,
      }, 200);
    } catch (e) {
      return json({
        debug: true,
        nettest: "fetch 실패",
        error: e.message,
        cause: e.cause ? String(e.cause) : null,
      }, 200);
    }
  }

  /* ── Step 4: 히스토리 구성 ── */
  var messages;
  try {
    var history = (body.history && Array.isArray(body.history))
      ? body.history.slice(-6)
      : [];
    messages = history.concat([{ role: "user", content: userMessage }]);
  } catch (e) {
    messages = [{ role: "user", content: userMessage }];
  }

  /* ── Step 5: API 요청 body 구성 ── */
  var reqBody;
  try {
    reqBody = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "당신은 인슈비 AI 보험 도우미입니다. 한국어로 보험 관련 질문에 친절하고 간결하게 답변하세요(300자 이내). 특정 상품 추천은 하지 말고, 일반적인 보험 지식을 안내하세요. 구체적 상담은 인슈비에서 설계사를 찾아보시라고 안내하세요.",
      messages: messages,
    });
  } catch (e) {
    return json({ step: "5-stringify", error: e.message }, 500);
  }

  /* ── Step 6: Anthropic API fetch ── */
  var apiResponse;
  try {
    apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: reqBody,
    });
  } catch (e) {
    return json({
      step: "6-fetch",
      error: "API 호출 네트워크 에러: " + e.message,
      reply: "죄송합니다. AI 서비스 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
    }, 502);
  }

  /* ── Step 7: API 응답 상태 확인 ── */
  if (!apiResponse.ok) {
    var errBody = "";
    try {
      errBody = await apiResponse.text();
    } catch (_) {
      errBody = "(읽기 실패)";
    }

    var userMsg = "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    if (apiResponse.status === 401) {
      userMsg = "AI 서비스 인증 오류입니다. 관리자에게 문의해주세요.";
    } else if (apiResponse.status === 429) {
      userMsg = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    } else if (errBody.indexOf("credit") !== -1) {
      userMsg = "AI 서비스가 일시적으로 제한되었습니다.";
    }

    return json({
      step: "7-api-error",
      error: userMsg,
      debug_status: apiResponse.status,
      debug_body: errBody.substring(0, 400),
    }, 502);
  }

  /* ── Step 8: 응답 body 파싱 ── */
  var apiData;
  try {
    apiData = await apiResponse.json();
  } catch (e) {
    return json({
      step: "8-json-parse",
      error: "API 응답 파싱 실패: " + e.message,
      reply: "응답 처리 중 오류가 발생했습니다.",
    }, 502);
  }

  /* ── Step 9: 텍스트 추출 ── */
  var reply;
  try {
    if (apiData && apiData.content && Array.isArray(apiData.content)) {
      var texts = [];
      for (var i = 0; i < apiData.content.length; i++) {
        if (apiData.content[i].type === "text" && apiData.content[i].text) {
          texts.push(apiData.content[i].text);
        }
      }
      reply = texts.join("\n");
    }
    if (!reply) {
      reply = "죄송합니다, 응답을 생성하지 못했습니다.";
    }
  } catch (e) {
    return json({
      step: "9-extract",
      error: e.message,
      reply: "응답 추출 중 오류가 발생했습니다.",
      debug_keys: apiData ? Object.keys(apiData) : null,
    }, 500);
  }

  /* ── Step 10: 최종 응답 ── */
  return json({ reply: reply, source: "ai" }, 200);
}

/* ── OPTIONS (CORS preflight) ── */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
