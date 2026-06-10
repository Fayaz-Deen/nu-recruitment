import axios from 'axios';
import type {
  JobDescription, JDInput, CandidateEvaluation, CandidateResult,
  InterviewGuide, InterviewGuideSummary, DraftedEmail,
  AuthUser, CompanyProfile, CompanyCompleteness, EmailTemplate,
  InterviewSchedule, InterviewSlot, PiiReport, DuplicateMatch, PriorityAction,
} from '../types';
import { tokenStore } from './authToken';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || ''}/api`,
  timeout: 60000,
  withCredentials: true,   // send httpOnly refresh-token cookie on every request
});

// ── Request: attach access token ─────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = tokenStore.getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ── Response: on 401, try refresh once then retry ────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Never attempt token refresh for auth endpoints — they issue/validate
    // tokens themselves and intercepting their 401s causes a deadlock where
    // the refresh request awaits itself via refreshInFlight.
    const isAuthEndpoint = original?.url?.startsWith('/auth/');

    if (!isAuthEndpoint && error.response?.status === 401 && !original._retried) {
      original._retried = true;

      const newToken = await tokenStore.refresh();
      if (newToken) {
        original.headers['Authorization'] = `Bearer ${newToken}`;
        return api(original);
      }
    }

    return Promise.reject(error);
  },
);

// ── Auth API ──────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ success: boolean; data: { accessToken: string; user: AuthUser } }>(
      '/auth/login', { email, password },
    ).then((r) => r.data.data!),

  refresh: () =>
    api.post<{ success: boolean; data: { accessToken: string; user: AuthUser } }>(
      '/auth/refresh',
    ).then((r) => r.data.data!),

  logout: () =>
    api.post('/auth/logout').then(() => undefined),

  me: () =>
    api.get<{ success: boolean; data: { accessToken: string; user: AuthUser } }>(
      '/auth/me',
    ).then((r) => r.data.data!),

  acceptInvite: (token: string, name: string, password: string) =>
    api.post<{ success: boolean; data: { message: string } }>(
      '/auth/accept-invite', { token, name, password },
    ).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<{ success: boolean; data: { message: string } }>(
      '/auth/forgot-password', { email },
    ).then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    api.post<{ success: boolean; data: { message: string } }>(
      '/auth/reset-password', { token, password },
    ).then((r) => r.data),
};

// ── Users API (admin) ─────────────────────────────────────────────────────────
export const usersApi = {
  list: () =>
    api.get<{ success: boolean; data: import('../types').User[] }>('/users')
      .then((r) => r.data.data!),

  invite: (email: string, role: string) =>
    api.post<{ success: boolean; data: { message: string; inviteUrl: string } }>(
      '/users/invite', { email, role },
    ).then((r) => r.data.data!),

  update: (id: string, updates: { role?: string; status?: string }) =>
    api.patch<{ success: boolean; data: import('../types').User }>(
      `/users/${id}`, updates,
    ).then((r) => r.data.data!),

  resendInvite: (id: string) =>
    api.post<{ success: boolean; data: { message: string; inviteUrl: string } }>(
      `/users/${id}/resend-invite`,
    ).then((r) => r.data.data!),

  updateMe: (updates: { name: string }) =>
    api.patch<{ success: boolean; data: AuthUser }>('/users/me', updates)
      .then((r) => r.data.data!),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ success: boolean; data: { message: string } }>(
      '/users/me/password', { currentPassword, newPassword },
    ).then((r) => r.data.data!),
};

// ── Company API ───────────────────────────────────────────────────────────────
export const companyApi = {
  get: () =>
    api.get<{ success: boolean; data: CompanyProfile }>('/company')
      .then((r) => r.data.data!),

  completeness: () =>
    api.get<{ success: boolean; data: CompanyCompleteness }>('/company/completeness')
      .then((r) => r.data.data!),

  update: (profile: Partial<CompanyProfile>) =>
    api.put<{ success: boolean; data: CompanyProfile }>('/company', profile)
      .then((r) => r.data.data!),

  uploadLogo: (file: File) => {
    const fd = new FormData(); fd.append('image', file);
    return api.post<{ success: boolean; data: { logoUrl: string } }>('/company/logo', fd)
      .then((r) => r.data.data!);
  },
  removeLogo: () => api.delete('/company/logo'),

  uploadFavicon: (file: File) => {
    const fd = new FormData(); fd.append('image', file);
    return api.post<{ success: boolean; data: { faviconUrl: string } }>('/company/favicon', fd)
      .then((r) => r.data.data!);
  },
  removeFavicon: () => api.delete('/company/favicon'),
};

// ── JD API ────────────────────────────────────────────────────────────────────
export const jdApi = {
  generate: (input: JDInput) =>
    api.post<{ success: boolean; data: JobDescription }>('/jd/generate', input)
      .then((r) => r.data.data!),
  list: () =>
    api.get<{ success: boolean; data: JobDescription[] }>('/jd/list')
      .then((r) => r.data.data!),
  remove: (id: string) =>
    api.delete<{ success: boolean; id: string }>(`/jd/${id}`)
      .then((r) => r.data),
  stats: () =>
    api.get<{
      success: boolean;
      data: {
        totalJobs: number;
        totalCandidates: number;
        totalEvaluations: number;
        totalInterviewGuides: number;
        totalEmails: number;
      };
    }>('/jd/stats').then((r) => r.data.data!),
};

// ── Resume API ────────────────────────────────────────────────────────────────
export const resumeApi = {
  upload: (files: File[], jobId?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append('resumes', f));
    if (jobId) form.append('jobId', jobId);
    return api.post<{
      success: boolean;
      data: {
        count: number;
        candidates: { id: string; fileName: string; piiReport: PiiReport; uploadedAt: string }[];
        duplicates: DuplicateMatch[];
      };
    }>('/resume/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.data!);
  },
  screen: (jd: JobDescription, candidateIds: string[]) =>
    api.post<{
      success: boolean;
      data: { total: number; evaluations: CandidateEvaluation[]; topCandidates: CandidateEvaluation[] };
    }>('/resume/screen', { jd, candidateIds }).then((r) => r.data.data!),
  results: (jobId: string) =>
    api.get<{ success: boolean; data: CandidateResult[] }>(`/resume/results?jobId=${jobId}`)
      .then((r) => r.data.data!),
  checkInterest: (candidateId: string) =>
    api.post<{ success: boolean; data: { message: string } }>(`/resume/check-interest/${candidateId}`)
      .then((r) => r.data),
  interestStats: () =>
    api.get<{
      success: boolean;
      data: {
        stats: { interested: number; checked: number; not_looking: number; unknown: number };
        recentInterested: { id: string; displayName: string; jobTitle: string; respondedAt: string | null }[];
      };
    }>('/resume/interest-stats').then((r) => r.data.data!),
  interestResponse: (token: string, r: string) =>
    api.get<{ success: boolean; response?: string; companyName?: string; alreadyRecorded?: boolean; error?: string }>(
      `/candidate/interest-response?token=${token}&r=${r}`,
    ).then((res) => res.data),
};

// ── Interview API ─────────────────────────────────────────────────────────────
export const interviewApi = {
  generateGuide: (jobId: string, candidateId: string) =>
    api.post<{ success: boolean; data: InterviewGuide }>('/interview/generate', { jobId, candidateId })
      .then((r) => r.data.data!),
  listGuides: (jobId: string) =>
    api.get<{ success: boolean; data: InterviewGuideSummary[] }>(`/interview/list?jobId=${jobId}`)
      .then((r) => r.data.data!),
  getGuide: (guideId: string) =>
    api.get<{ success: boolean; data: InterviewGuide }>(`/interview/${guideId}`)
      .then((r) => r.data.data!),
};

// ── Email Templates API ───────────────────────────────────────────────────────
export const emailTemplatesApi = {
  list: () =>
    api.get<{ success: boolean; data: EmailTemplate[] }>('/email-templates')
      .then((r) => r.data.data!),

  get: (key: string) =>
    api.get<{ success: boolean; data: EmailTemplate }>(`/email-templates/${key}`)
      .then((r) => r.data.data!),

  update: (key: string, payload: { subject: string; body: string }) =>
    api.put<{ success: boolean; data: EmailTemplate }>(`/email-templates/${key}`, payload)
      .then((r) => r.data.data!),

};

// ── Communication API ─────────────────────────────────────────────────────────
export const communicationApi = {
  draftEmail: (jobId: string, candidateId: string) =>
    api.post<{ success: boolean; data: DraftedEmail }>('/communication/draft', { jobId, candidateId })
      .then((r) => r.data.data!),
  getDraftedEmails: (jobId: string) =>
    api.get<{ success: boolean; data: DraftedEmail[] }>(`/communication/list?jobId=${jobId}`)
      .then((r) => r.data.data!),
  sendEmail: (emailId: string, overrides?: { subject?: string; body?: string }) =>
    api.post<{ success: boolean; data: { emailId: string; candidateId: string; emailType: string; sentAt: string } }>(
      '/communication/send', { emailId, ...overrides }
    ).then((r) => r.data.data!),
};

export const scheduleApi = {
  init: (payload: {
    emailId?: string; candidateId: string; jobId: string;
    candidateName?: string; jobTitle?: string; candidateEmail?: string;
  }) =>
    api.post<{ success: boolean; data: InterviewSchedule }>('/schedule/init', payload)
      .then((r) => r.data.data!),

  getByEmail: (emailId: string) =>
    api.get<{ success: boolean; data: InterviewSchedule | null }>(`/schedule/by-email/${emailId}`)
      .then((r) => r.data.data),

  addSlot: (scheduleId: string, startTime: string, endTime: string) =>
    api.post<{ success: boolean; data: InterviewSlot }>('/schedule/slots', { scheduleId, startTime, endTime })
      .then((r) => r.data.data!),

  editSlot: (slotId: string, startTime: string, endTime: string) =>
    api.put<{ success: boolean; data: InterviewSlot }>(`/schedule/slots/${slotId}`, { startTime, endTime })
      .then((r) => r.data.data!),

  deleteSlot: (slotId: string) =>
    api.delete<{ success: boolean }>(`/schedule/slots/${slotId}`)
      .then((r) => r.data),

  getPublic: (token: string) =>
    api.get<{ success: boolean; data: {
      scheduleId: string; candidateName: string | null; jobTitle: string | null;
      status: string; slots: InterviewSlot[]; alreadyConfirmed: boolean; isUnavailable?: boolean;
    } }>(`/schedule/public/${token}`)
      .then((r) => r.data.data!),

  selectSlot: (token: string, slotId: string) =>
    api.post<{ success: boolean; data: {
      scheduleId: string; slotId: string; startTime: string; endTime: string;
      candidateName: string | null; jobTitle: string | null;
    } }>('/schedule/select', { token, slotId })
      .then((r) => r.data.data!),

  priorityActions: () =>
    api.get<{ success: boolean; data: PriorityAction[] }>('/schedule/priority-actions')
      .then((r) => r.data.data!),
};
