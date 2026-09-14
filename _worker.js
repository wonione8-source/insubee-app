/**
 * 인슈비 — Cloudflare Pages _worker.js
 * v8.1 — Direct Upload용 API 라우터
 * 이 파일을 프로젝트 루트(최상위)에 넣으세요
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

function checkFAQ(msg) {
  var m = msg.toLowerCase();
  var faqs = [
    { k: ["실손", "실비"], a: "실손의료보험은 실제 의료비를 보장하는 보험입니다. 2024년부터 4세대 실손보험이 판매되고 있으며, 급여/비급여 구분 보장에 자기부담금 비율이 달라집니다. 기존 실손보험을 갖고 계신다면 전환 여부를 설계사와 상담해보세요." },
    { k: ["자동차", "차보험", "자보"], a: "자동차보험은 의무보험(대인/대물)과 선택보험(자기신체, 자기차량 등)으로 구성됩니다. 보험료는 차종, 연령, 사고이력에 따라 달라지며, 비교견적 후 가입하시는 것을 권합니다." },
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

async function handleChat(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "POST만 허용됩니다" }, 405);
  }

  try {
    var apiKey = env.ANTHROPIC_API_KEY;

    var body;
    try { body = await request.json(); } catch (e) {
      return json({ step: "1-body", error: "요청 파싱 실패: " + e.message }, 400);
    }
    var userMessage = (body && body.message) ? String(body.message).trim() : "";
    if (!userMessage) return json({ step: "1", error: "message 비어있음" }, 400);

    // Debug mode
    if (userMessage === "__debug__") {
      return json({
        debug: true, version: "v8.1-worker",
        hasApiKey: !!apiKey,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + "..." : "MISSING",
        apiKeyLength: apiKey ? apiKey.length : 0,
        timestamp: new Date().toISOString(),
      }, 200);
    }

    // FAQ
    var faqAnswer = checkFAQ(userMessage);
    if (faqAnswer) return json({ reply: faqAnswer, source: "faq" }, 200);

    // Net test
    if (userMessage === "__nettest__") {
      try {
        var testResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": "test", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
        });
        return json({ debug: true, nettest: "OK", status: testResp.status }, 200);
      } catch (e) {
        return json({ debug: true, nettest: "FAIL", error: e.message }, 200);
      }
    }

    if (!apiKey) return json({ step: "0-env", error: "ANTHROPIC_API_KEY 미설정", reply: "AI 서비스 설정이 필요합니다. 관리자에게 문의해주세요." }, 500);

    var messages;
    try {
      var history = (body.history && Array.isArray(body.history)) ? body.history.slice(-6) : [];
      messages = history.concat([{ role: "user", content: userMessage }]);
    } catch (e) {
      messages = [{ role: "user", content: userMessage }];
    }

    var apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "당신은 인슈비 AI 보험 도우미입니다. 한국어로 보험 관련 질문에 친절하고 간결하게 답변하세요(300자 이내). 특정 상품 추천은 하지 말고, 일반적인 보험 지식을 안내하세요.",
        messages: messages,
      }),
    });

    if (!apiResponse.ok) {
      var errBody = "";
      try { errBody = await apiResponse.text(); } catch (_) {}
      var userMsg = "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      if (apiResponse.status === 401) userMsg = "AI 서비스 인증 오류입니다. 관리자에게 문의해주세요.";
      else if (apiResponse.status === 429) userMsg = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
      return json({ step: "7-api", error: userMsg, debug_status: apiResponse.status, debug_body: errBody.substring(0, 400) }, 502);
    }

    var apiData = await apiResponse.json();
    var reply = "";
    if (apiData && apiData.content && Array.isArray(apiData.content)) {
      for (var i = 0; i < apiData.content.length; i++) {
        if (apiData.content[i].type === "text") reply += apiData.content[i].text;
      }
    }
    if (!reply) reply = "죄송합니다, 응답을 생성하지 못했습니다.";
    return json({ reply: reply, source: "ai" }, 200);

  } catch (outerErr) {
    return json({ error: "서버 오류", message: String(outerErr), step: "outer" }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname === "/api/chat") {
      return handleChat(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
