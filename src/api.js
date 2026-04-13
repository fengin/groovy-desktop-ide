/**
 * Groovy Script 管理 API 封装
 *
 * 对应后端 GroovyScriptManageController:
 *   GET    /api/groovy/script/list
 *   GET    /api/groovy/script/:id
 *   POST   /api/groovy/script
 *   PUT    /api/groovy/script/:id
 *   DELETE /api/groovy/script/:id
 *   POST   /api/groovy/script/test
 *   POST   /api/groovy/script/deploy
 *   GET    /api/groovy/script/completions
 *   POST   /api/groovy/script/refresh/:bizCode
 *   POST   /api/groovy/script/refresh/all
 *
 * Desktop IDE 通过 Tauri HTTP 插件发请求（绕过 CORS），
 * 开发模式下回退到浏览器原生 fetch + Vite 代理。
 */

let BASE_URL = '';
let API_KEY = '';
let AUTH_TOKEN = '';

// Tauri HTTP 插件的 fetch（从 Rust 侧发请求，无 CORS 限制）
let tauriFetch = null;

/**
 * 初始化 Tauri HTTP 插件
 * 在 Tauri 桌面环境中使用 Rust 发 HTTP 请求，绕过浏览器 CORS 限制
 */
export async function initHttpPlugin() {
  console.log('[API] __TAURI_INTERNALS__ exists:', !!window.__TAURI_INTERNALS__);
  try {
    if (window.__TAURI_INTERNALS__) {
      const mod = await import('@tauri-apps/plugin-http');
      console.log('[API] plugin-http module:', Object.keys(mod));
      tauriFetch = mod.fetch;
      console.log('[API] ✅ Tauri HTTP plugin loaded — CORS bypassed');
    } else {
      console.log('[API] Not in Tauri environment, using browser fetch + Vite proxy');
    }
  } catch (e) {
    console.warn('[API] ❌ Tauri HTTP plugin failed to load:', e);
  }
}

/**
 * 智能 fetch — Tauri 环境用插件 fetch，否则用浏览器原生 fetch
 */
function smartFetch(url, opts) {
  if (tauriFetch) {
    console.log('[API] Using Tauri HTTP plugin fetch →', url);
    return tauriFetch(url, opts);
  }
  console.log('[API] Using browser native fetch →', url);
  return fetch(url, opts);
}

export function configure(baseUrl, apiKey, authToken = '') {
  BASE_URL = baseUrl.replace(/\/+$/, '');
  API_KEY = apiKey;
  AUTH_TOKEN = authToken;
}

export function isConfigured() {
  return !!BASE_URL && !!API_KEY;
}

async function request(method, path, body = null, extraHeaders = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'X-Groovy-Token': API_KEY,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const opts = { method, headers };
  if (body !== null) {
    opts.body = JSON.stringify(body);
  }

  const resp = await smartFetch(url, opts);
  if (!resp.ok) {
    // 尝试解析 JSON 响应（后端通常返回 CommonResult 格式）
    let errorBody;
    try {
      errorBody = await resp.json();
    } catch {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    // 如果是 CommonResult 格式，返回给调用方处理
    if (errorBody && errorBody.code) {
      return errorBody;
    }
    throw new Error(`HTTP ${resp.status}: ${errorBody.msg || errorBody.message || JSON.stringify(errorBody)}`);
  }
  return resp.json();
}

/**
 * 原始 fetch — 返回 Response 对象，不自动解析为 JSON
 * 用于 testScript 等可能返回文件流的接口
 */
async function rawRequest(method, path, body = null, extraHeaders = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'X-Groovy-Token': API_KEY,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  const opts = { method, headers };
  if (body !== null) {
    opts.body = JSON.stringify(body);
  }
  const resp = await smartFetch(url, opts);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  return resp; // 返回原始 Response，由调用方按 Content-Type 处理
}

/** ① 脚本列表 */
export async function listScripts(category, projectCode) {
  let path = '/api/groovy/script/list?';
  if (category) path += `category=${encodeURIComponent(category)}&`;
  if (projectCode) path += `projectCode=${encodeURIComponent(projectCode)}&`;
  return request('GET', path);
}

/** ② 脚本详情 */
export async function getScript(id) {
  return request('GET', `/api/groovy/script/${id}`);
}

/** ③ 新建脚本 */
export async function createScript(script) {
  return request('POST', '/api/groovy/script', script);
}

/** ④ 更新脚本 */
export async function updateScript(id, script) {
  return request('PUT', `/api/groovy/script/${id}`, script);
}

/** ⑤ 删除脚本 */
export async function deleteScript(id) {
  return request('DELETE', `/api/groovy/script/${id}`);
}

/** ⑥ 测试执行（返回原始 Response，支持 JSON 和文件下载两种响应） */
export async function testScript(bizCode, params, track = false) {
  const extra = {};
  if (AUTH_TOKEN) {
    extra['Authorization'] = AUTH_TOKEN;
  }
  return rawRequest('POST', '/api/groovy/script/test', {
    bizCode,
    params,
    track,
  }, extra);
}

/** ⑦ 批量部署 */
export async function deployScripts(scripts) {
  return request('POST', '/api/groovy/script/deploy', scripts);
}

/** ⑧ 代码补全数据 */
export async function getCompletions() {
  return request('GET', '/api/groovy/script/completions');
}

/** ⑨ 刷新缓存 */
export async function refreshScript(bizCode) {
  return request('POST', `/api/groovy/script/refresh/${bizCode}`);
}

/** ⑩ 刷新全部 */
export async function refreshAll() {
  return request('POST', '/api/groovy/script/refresh/all');
}

/** 连接测试 */
export async function ping() {
  return listScripts();
}
