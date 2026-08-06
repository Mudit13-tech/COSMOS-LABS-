// js/api.js
// API client for Cosmos Lab Django backend.
// Replaces Firebase SDK entirely with simple fetch() calls.

const API_BASE = '/api';

function getCookie(name) {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [key, val] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(val);
  }
  return null;
}

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken') || '',
    },
    credentials: 'same-origin',
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ---- Auth ---------------------------------------------------------------

export async function apiRegister(email, password) {
  return request('POST', '/auth/register/', { email, password });
}

export async function apiLogin(email, password) {
  return request('POST', '/auth/login/', { email, password });
}

export async function apiLogout() {
  return request('POST', '/auth/logout/');
}

export async function apiGetMe() {
  const res = await fetch(`${API_BASE}/auth/me/`, { credentials: 'same-origin' });
  const data = await res.json();
  return data;
}

// ---- Plan ---------------------------------------------------------------

export async function apiGetPlan() {
  return request('GET', '/plan/');
}

export async function apiGeneratePlan(topic) {
  return request('POST', '/plan/generate/', { topic });
}

export async function apiResetPlan() {
  return request('POST', '/plan/reset/');
}

// ---- Progress -----------------------------------------------------------

export async function apiGetProgress() {
  return request('GET', '/progress/');
}

export async function apiCompleteTask(taskId, dayIndex, phaseIndex, { note = '', loggedMinutes = 0 } = {}) {
  return request('POST', '/progress/complete-task/', {
    taskId, dayIndex, phaseIndex, note, loggedMinutes,
  });
}

export async function apiToggleTask(taskId, dayIndex, phaseIndex) {
  return request('POST', '/progress/toggle-task/', {
    taskId, dayIndex, phaseIndex,
  });
}

export async function apiResetProgress() {
  return request('POST', '/progress/reset/');
}
