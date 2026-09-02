/* ============================================================
   인슈비앱 (InsuBee) — Core App JS
   Supabase 클라이언트 + Auth + 유틸리티
   v4 — 2026-09-01 변수 충돌 해결
   ============================================================ */

const SUPABASE_URL = 'https://dfzhjqychbodpdwdkdab.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1Q3qrqGccSF3F6pT1SJX6g_rQoHUbZc';

// Supabase 클라이언트 초기화
// ⚠️ CDN이 window.supabase를 사용하므로 클라이언트는 sb로 명명
var sb = null;
var supabaseReady = false;
var supabaseError = null;

try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    supabaseReady = true;
    console.log('[InsuBee] Supabase client initialized OK');
  } else {
    supabaseError = 'Supabase 라이브러리가 로드되지 않았습니다.';
    console.error('[InsuBee]', supabaseError);
  }
} catch (e) {
  supabaseError = 'Supabase 초기화 실패: ' + e.message;
  console.error('[InsuBee]', supabaseError);
}

// 페이지에 에러 표시
function showPageError(msg) {
  console.error('[InsuBee Error]', msg);
  var box = document.getElementById('page-error-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'page-error-box';
    box.style.cssText = 'background:#fff3f3;color:#c00;border:1px solid #fcc;border-radius:10px;padding:14px 18px;margin:16px auto;max-width:680px;font-size:14px;line-height:1.6;word-break:break-all;';
    var container = document.querySelector('.page-container') || document.body;
    container.prepend(box);
  }
  box.innerHTML = '⚠️ ' + msg;
  box.style.display = 'block';
}

// ========================
// Auth 관련
// ========================

async function getCurrentUser() {
  if (!sb) return null;
  try {
    var r = await sb.auth.getUser();
    if (r.error) { console.warn('[InsuBee] getUser error:', r.error.message); return null; }
    return (r.data && r.data.user) ? r.data.user : null;
  } catch (e) { console.warn('[InsuBee] getCurrentUser catch:', e.message); return null; }
}

async function getSession() {
  if (!sb) return null;
  try {
    var r = await sb.auth.getSession();
    if (r.error) return null;
    return (r.data && r.data.session) ? r.data.session : null;
  } catch (e) { return null; }
}

async function getCurrentProfile() {
  var user = await getCurrentUser();
  if (!user || !sb) { console.warn('[InsuBee] getCurrentProfile: no user or sb'); return null; }
  try {
    var r = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (r.error) {
      console.error('[InsuBee] profiles query error:', r.error.message, r.error.code, r.error.hint);
      // 테이블이 없으면 안내
      if (r.error.message && r.error.message.includes('relation')) {
        showPageError('profiles 테이블이 존재하지 않습니다. Supabase SQL Editor에서 테이블을 생성해주세요.');
      }
      return null;
    }
    return r.data;
  } catch (e) { console.error('[InsuBee] getCurrentProfile catch:', e); return null; }
}

async function signUp(email, password, name, role) {
  if (!sb) throw new Error('서버 연결에 실패했습니다. 페이지를 새로고침 해주세요.');
  var r = await sb.auth.signUp({
    email: email,
    password: password,
    options: { data: { name: name, role: role } }
  });
  if (r.error) throw r.error;
  return r.data;
}

async function signIn(email, password) {
  if (!sb) throw new Error('서버 연결에 실패했습니다. 페이지를 새로고침 해주세요.');
  var r = await sb.auth.signInWithPassword({ email: email, password: password });
  if (r.error) throw r.error;
  return r.data;
}

async function signOut() {
  if (sb) await sb.auth.signOut();
  location.href = '/login.html';
}

async function requireAuth() {
  var user = await getCurrentUser();
  if (!user) { location.href = '/login.html'; return null; }
  return user;
}

// ========================
// 설계사 관련
// ========================

async function getAgents(filters) {
  if (!sb) return [];
  filters = filters || {};

  var query = sb
    .from('agents')
    .select('*, profiles!inner(name, avatar_url, email, phone)')
    .eq('is_public', true)
    .order('avg_rating', { ascending: false });

  if (filters.region_sido) query = query.eq('region_sido', filters.region_sido);
  if (filters.specialty) query = query.contains('specialties', [filters.specialty]);
  if (filters.search) query = query.or('company.ilike.%' + filters.search + '%,profiles.name.ilike.%' + filters.search + '%');

  var r = await query.limit(20);
  if (r.error) {
    console.error('[InsuBee] getAgents error:', r.error);
    if (r.error.message && r.error.message.includes('relation')) throw new Error('DB_NOT_READY');
    throw r.error;
  }
  return r.data || [];
}

async function getAgentDetail(agentId) {
  if (!sb) throw new Error('서버 연결 실패');
  var r = await sb.from('agents').select('*, profiles!inner(name, avatar_url, email, phone)').eq('id', agentId).single();
  if (r.error) throw r.error;
  return r.data;
}

async function getAgentReviews(agentId) {
  if (!sb) return [];
  var r = await sb.from('reviews').select('*, customers!inner(profiles:user_id(name))').eq('agent_id', agentId).eq('is_visible', true).order('created_at', { ascending: false }).limit(10);
  if (r.error) return [];
  return r.data || [];
}

async function upsertAgentProfile(agentData) {
  var user = await getCurrentUser();
  if (!user || !sb) throw new Error('로그인이 필요합니다');
  var ex = await sb.from('agents').select('id').eq('user_id', user.id).single();
  if (ex.data) {
    var r = await sb.from('agents').update(agentData).eq('user_id', user.id).select().single();
    if (r.error) throw r.error; return r.data;
  } else {
    agentData.user_id = user.id;
    var r2 = await sb.from('agents').insert(agentData).select().single();
    if (r2.error) throw r2.error; return r2.data;
  }
}

// ========================
// 고객 관련
// ========================

async function upsertCustomerProfile(customerData) {
  var user = await getCurrentUser();
  if (!user || !sb) throw new Error('로그인이 필요합니다');
  var ex = await sb.from('customers').select('id').eq('user_id', user.id).single();
  if (ex.data) {
    var r = await sb.from('customers').update(customerData).eq('user_id', user.id).select().single();
    if (r.error) throw r.error; return r.data;
  } else {
    customerData.user_id = user.id;
    var r2 = await sb.from('customers').insert(customerData).select().single();
    if (r2.error) throw r2.error; return r2.data;
  }
}

// ========================
// 매칭 요청 관련
// ========================

async function createMatchingRequest(agentId, requestData) {
  var user = await getCurrentUser();
  if (!user || !sb) throw new Error('로그인이 필요합니다');
  var cr = await sb.from('customers').select('id').eq('user_id', user.id).single();
  if (!cr.data) throw new Error('고객 프로필을 먼저 작성해주세요');
  requestData.customer_id = cr.data.id;
  requestData.agent_id = agentId;
  var r = await sb.from('matching_requests').insert(requestData).select().single();
  if (r.error) throw r.error;
  try {
    var ag = await sb.from('agents').select('user_id').eq('id', agentId).single();
    if (ag.data) {
      await sb.from('notifications').insert({
        user_id: ag.data.user_id, type: 'matching_request',
        title: '새 상담 요청이 도착했습니다',
        body: (requestData.insurance_type || '') + ' 관련 상담을 요청했습니다.',
        data: { request_id: r.data.id }
      });
    }
  } catch (e) { console.warn('[InsuBee] notification error (non-fatal):', e); }
  return r.data;
}

async function getMyRequests() {
  var user = await getCurrentUser();
  if (!user || !sb) return [];
  var cr = await sb.from('customers').select('id').eq('user_id', user.id).single();
  if (!cr.data) return [];
  var r = await sb.from('matching_requests').select('*, agents!inner(company, profiles:user_id(name))').eq('customer_id', cr.data.id).order('created_at', { ascending: false });
  if (r.error) return [];
  return r.data || [];
}

async function getReceivedRequests() {
  var user = await getCurrentUser();
  if (!user || !sb) return [];
  var ag = await sb.from('agents').select('id').eq('user_id', user.id).single();
  if (!ag.data) return [];
  var r = await sb.from('matching_requests').select('*, customers!inner(region_sido, interests, profiles:user_id(name, phone, email))').eq('agent_id', ag.data.id).order('created_at', { ascending: false });
  if (r.error) return [];
  return r.data || [];
}

async function respondToRequest(requestId, status, message) {
  if (!sb) throw new Error('서버 연결 실패');
  var r = await sb.from('matching_requests').update({
    status: status, agent_response_message: message, responded_at: new Date().toISOString()
  }).eq('id', requestId).select().single();
  if (r.error) throw r.error;
  try {
    var req = await sb.from('matching_requests').select('customer_id, customers!inner(user_id)').eq('id', requestId).single();
    if (req.data) {
      await sb.from('notifications').insert({
        user_id: req.data.customers.user_id,
        type: status === 'accepted' ? 'request_accepted' : 'request_rejected',
        title: status === 'accepted' ? '상담 요청이 수락되었습니다!' : '상담 요청이 거절되었습니다.',
        body: message || '', data: { request_id: requestId }
      });
    }
  } catch (e) { console.warn('[InsuBee] notification error:', e); }
  return r.data;
}

// ========================
// 알림 관련
// ========================

async function getNotifications() {
  var user = await getCurrentUser();
  if (!user || !sb) return [];
  var r = await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
  if (r.error) return [];
  return r.data || [];
}

async function getUnreadCount() {
  var user = await getCurrentUser();
  if (!user || !sb) return 0;
  var r = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
  if (r.error) return 0;
  return r.count || 0;
}

async function markNotificationRead(notifId) {
  if (!sb) return;
  await sb.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', notifId);
}

async function markAllNotificationsRead() {
  var user = await getCurrentUser();
  if (!user || !sb) return;
  await sb.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('user_id', user.id).eq('is_read', false);
}

function subscribeToNotifications(userId, callback) {
  if (!sb) return null;
  return sb.channel('notifications').on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + userId
  }, function(payload) { callback(payload.new); }).subscribe();
}

// ========================
// 유틸리티
// ========================

function showToast(message, duration) {
  duration = duration || 3000;
  var toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, duration);
}

function timeAgo(dateStr) {
  var now = new Date();
  var date = new Date(dateStr);
  var diff = Math.floor((now - date) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
  return date.toLocaleDateString('ko-KR');
}

function getStatusLabel(status) {
  var map = { pending:'대기중', accepted:'수락됨', rejected:'거절됨', in_progress:'진행중', completed:'완료', cancelled:'취소됨' };
  return map[status] || status;
}

function getStatusClass(status) {
  var map = { pending:'status-pending', accepted:'status-accepted', rejected:'status-rejected', in_progress:'status-progress', completed:'status-completed', cancelled:'status-cancelled' };
  return map[status] || '';
}

async function getInsuranceCategories() {
  if (!sb) return [];
  try {
    var r = await sb.from('insurance_categories').select('*').eq('is_active', true).order('sort_order');
    if (r.error) return [];
    return r.data || [];
  } catch (e) { return []; }
}

var REGIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
];
