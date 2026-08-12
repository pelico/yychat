// Cloudflare Pages Function: 钉钉 webhook 代理（服务端全局去重）
// 用 Cache API 跨边缘实例共享去重状态；本实例内存做 L1 本地缓存

const CACHE_TTL = 3 * 60; // 3 分钟（Cache API 用秒）
const L1_MAX = 200;
let _l1 = new Map(); // L1 本地内存缓存：key -> expireAt(ms)

function l1Hit(key) {
  const now = Date.now();
  if (_l1.size > L1_MAX) {
    for (const [k, v] of _l1) {
      if (v < now) _l1.delete(k);
      if (_l1.size <= L1_MAX * 0.6) break;
    }
  }
  if (_l1.has(key)) {
    if (_l1.get(key) >= now) return true;
    _l1.delete(key);
  }
  _l1.set(key, now + CACHE_TTL * 1000);
  return false;
}

export async function onRequestPost(context) {
  const WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=242a5cb0d85f95bb608fcb1bcead40fe8152ed50cae24db39f86308bbeba9a70";
  try {
    const request = context.request;
    const { title, content, tag } = await request.json();
    const text = content || "";
    const dedupKey = tag || ("h" + hashStr(text));

    // L1：本地内存（同实例内最快，1-2ms）
    if (l1Hit(dedupKey)) {
      return new Response(JSON.stringify({ errcode: 0, errmsg: "ok", deduplicated: true, via: "l1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // L2：Cache API（跨边缘实例共享，所有浏览器/设备都命中）
    // 构造一个用于 cache 的虚拟 GET 请求（Cache API 只存 GET 响应）
    const cacheKey = new Request("https://ding-dedup.local/" + encodeURIComponent(dedupKey), {
      method: "GET",
      headers: { "CF-Cache-Status": "yychat-dingtalk-dedup" }
    });
    const cache = caches.default;
    let cachedResp = null;
    try { cachedResp = await cache.match(cacheKey); } catch (e) {}
    if (cachedResp) {
      return new Response(JSON.stringify({ errcode: 0, errmsg: "ok", deduplicated: true, via: "l2" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    // 写入 Cache API（存个空响应，通过 Cache-Control 设置 TTL）
    try {
      const cacheResp = new Response("1", {
        headers: { "Cache-Control": `public, max-age=${CACHE_TTL}`, "Content-Type": "text/plain" }
      });
      context.waitUntil(cache.put(cacheKey, cacheResp));
    } catch (e) {}

    // 真正推钉钉
    const resp = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { title: title || "消息", content: text } })
    });
    const data = await resp.json();
    // 失败时清理 L1 和 L2 缓存，可重试
    if (data && data.errcode !== 0) {
      _l1.delete(dedupKey);
      try { context.waitUntil(cache.delete(cacheKey)); } catch (e) {}
    }
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ errcode: -1, errmsg: String(e) }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestGet(context) {
  return new Response(JSON.stringify({ ok: true, msg: "dingtalk proxy ready", l1_size: _l1.size }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
