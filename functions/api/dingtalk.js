// Cloudflare Pages Function: 钉钉 webhook 代理
// Pages Functions (functions/ 目录) 默认 GET-only，需显式声明 onRequestPost
export async function onRequestPost(context) {
  const WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=242a5cb0d85f95bb608fcb1bcead40fe8152ed50cae24db39f86308bbeba9a70";
  const KEYWORD = ". : lts";
  try {
    const request = context.request;
    const { title, content } = await request.json();
    const text = (content || "") + "\n\n: lts";
    const resp = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { title: title || "消息", content: text } })
    });
    const data = await resp.json();
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
  return new Response(JSON.stringify({ ok: true, msg: "dingtalk proxy ready" }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
