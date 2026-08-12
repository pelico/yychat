// Cloudflare Pages Function: 钉钉 webhook 代理（服务端全局去重）
// 同部署的 Worker 实例共享内存，即使不同浏览器/设备都走这里，可全局去重

// LRU 缓存：key = tag / value = expireAt
const CACHE_MAX = 200;
const CACHE_TTL = 3 * 60 * 1000; // 3 分钟
let _cache = new Map();

function _hit(key) {
  const now = Date.now();
  // 定期清理过期
  if (_cache.size > CACHE_MAX) {
    for (const [k, v] of _cache) {
      if (v < now) _cache.delete(k);
      if (_cache.size <= CACHE_MAX * 0.6) break;
    }
  }
  if (_cache.has(key)) {
    const expire = _cache.get(key);
    if (expire >= now) return true;
    _cache.delete(key);
  }
  _cache.set(key, now + CACHE_TTL);
  return false;
}

export async function onRequestPost(context) {
  const WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=242a5cb0d85f95bb608fcb1bcead40fe8152ed50cae24db39f86308bbeba9a70";
  try {
    const request = context.request;
    const { title, content, tag } = await request.json();
    const text = content || "";

    // 服务端去重：有 tag 就用 tag，没有就用内容 hash
    const dedupKey = tag || ("h" + hashStr(text));
    if (_hit(dedupKey)) {
      return new Response(JSON.stringify({ errcode: 0, errmsg: "ok", deduplicated: true }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const resp = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { title: title || "消息", content: text } })
    });
    const data = await resp.json();
    // 失败时释放去重键
    if (data && data.errcode !== 0) {
      _cache.delete(dedupKey);
    }
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ errcode: -1, errmsg: String(e) }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestGet(context) {
  return new Response(JSON.stringify({ ok: true, msg: "dingtalk proxy ready", cache_size: _cache.size }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

// 简单字符串 hash（FNV-1a 32bit），无 tag 时兜底做内容去重
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
