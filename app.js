/* ============================================================
   인슈비앱 (InsuBee) — Core App JS
   Supabase 클라이언트 + Auth + 유틸리티
   ============================================================ */

const SUPABASE_URL = 'https://dfzhjqychbodpdwdkdab.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1Q3qrqGccSF3F6pT1SJX6g_rQoHUbZc';

// Supabase 클라이언트 초기화
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========================
// Auth 관련
// ========================

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return data;
}

async function signUp(email, password, name, role) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role }
    }
  });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  await supabase.auth.signOut();
  location.href = '/login.html';
}

// 로그인 체크 (보호 페이지용)
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    location.href = '/login.html';
    return null;
  }
  return user;
}

// ========================
// 설계사 관련
// ========================

async function getAgents(filters = {}) {
  let query = supabase
    .from('agents')
    .select(`
      *,
      profiles!inner(name, avatar_url, email, phone)
    `)
    .eq('is_public', true)
    .order('avg_rating', { ascending: false });

  if (filters.region_sido) {
    query = query.eq('region_sido', filters.region_sido);
  }
  if (filters.specialty) {
    query = query.contains('specialties', [filters.specialty]);
  }
  if (filters.search) {
    query = query.or(`company.ilike.%${filters.search}%,profiles.name.ilike.%${filters.search}%`);
  }

  const { data, error } = await query.limit(20);
  if (error) throw error;
  return data || [];
}

async function getAgentDetail(agentId) {
  const { data, error } = await supabase
    .from('agents')
    .select(`
      *,
      profiles!inner(name, avatar_url, email, phone)
    `)
    .eq('id', agentId)
    .single();
  if (error) throw error;
  return data;
}

async function getAgentReviews(agentId) {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      customers!inner(
        profiles:user_id(name)
      )
    `)
    .eq('agent_id', agentId)
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data || [];
}

// 설계사 프로필 생성/수정
async function upsertAgentProfile(agentData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');

  // 기존 설계사 프로필 확인
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('agents')
      .update(agentData)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('agents')
      .insert({ ...agentData, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

// ========================
// 고객 관련
// ========================

async function upsertCustomerProfile(customerData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('customers')
      .update(customerData)
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('customers')
      .insert({ ...customerData, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

// ========================
// 매칭 요청 관련
// ========================

async function createMatchingRequest(agentId, requestData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다');

  // 고객 ID 조회
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!customer) throw new Error('고객 프로필을 먼저 작성해주세요');

  const { data, error } = await supabase
    .from('matching_requests')
    .insert({
      customer_id: customer.id,
      agent_id: agentId,
      ...requestData
    })
    .select()
    .single();

  if (error) throw error;

  // 알림 생성 (설계사에게)
  const { data: agent } = await supabase
    .from('agents')
    .select('user_id')
    .eq('id', agentId)
    .single();

  if (agent) {
    await supabase.from('notifications').insert({
      user_id: agent.user_id,
      type: 'matching_request',
      title: '새 상담 요청이 도착했습니다',
      body: `${requestData.insurance_type} 관련 상담을 요청했습니다.`,
      data: { request_id: data.id }
    });
  }

  return data;
}

// 내 매칭 요청 목록 (고객용)
async function getMyRequests() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!customer) return [];

  const { data, error } = await supabase
    .from('matching_requests')
    .select(`
      *,
      agents!inner(
        company,
        profiles:user_id(name)
      )
    `)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 받은 매칭 요청 목록 (설계사용)
async function getReceivedRequests() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!agent) return [];

  const { data, error } = await supabase
    .from('matching_requests')
    .select(`
      *,
      customers!inner(
        region_sido,
        interests,
        profiles:user_id(name, phone, email)
      )
    `)
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 매칭 요청 응답 (설계사용)
async function respondToRequest(requestId, status, message) {
  const { data, error } = await supabase
    .from('matching_requests')
    .update({
      status,
      agent_response_message: message,
      responded_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;

  // 고객에게 알림
  const { data: request } = await supabase
    .from('matching_requests')
    .select('customer_id, customers!inner(user_id)')
    .eq('id', requestId)
    .single();

  if (request) {
    const notifType = status === 'accepted' ? 'request_accepted' : 'request_rejected';
    const notifTitle = status === 'accepted'
      ? '상담 요청이 수락되었습니다!'
      : '상담 요청이 거절되었습니다.';

    await supabase.from('notifications').insert({
      user_id: request.customers.user_id,
      type: notifType,
      title: notifTitle,
      body: message || '',
      data: { request_id: requestId }
    });
  }

  return data;
}

// ========================
// 알림 관련
// ========================

async function getNotifications() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return data || [];
}

async function getUnreadCount() {
  const user = await getCurrentUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) return 0;
  return count || 0;
}

async function markNotificationRead(notifId) {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notifId);
}

async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_read', false);
}

// ========================
// Realtime 구독 (알림)
// ========================

function subscribeToNotifications(userId, callback) {
  return supabase
    .channel('notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => callback(payload.new)
    )
    .subscribe();
}

// ========================
// 유틸리티
// ========================

function showToast(message, duration = 3000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return date.toLocaleDateString('ko-KR');
}

function getStatusLabel(status) {
  const map = {
    pending: '대기중',
    accepted: '수락됨',
    rejected: '거절됨',
    in_progress: '진행중',
    completed: '완료',
    cancelled: '취소됨'
  };
  return map[status] || status;
}

function getStatusClass(status) {
  const map = {
    pending: 'status-pending',
    accepted: 'status-accepted',
    rejected: 'status-rejected',
    in_progress: 'status-progress',
    completed: 'status-completed',
    cancelled: 'status-cancelled'
  };
  return map[status] || '';
}

// 보험 카테고리 로드
async function getInsuranceCategories() {
  const { data, error } = await supabase
    .from('insurance_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) return [];
  return data || [];
}

// 시/도 목록
const REGIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
];
