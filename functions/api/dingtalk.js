// Cloudflare Pages Function: 钉钉 webhook 代理（绕过浏览器 CORS 限制）
// 部署后路径: /api/dingtalk
export default {
  async onRequest(request) {
    // 允许 POST
    if (request.method === "POST") {
      return this.onPost(request);
    }
    // GET 也支持（方便测试）
    return this.onGet(request);
  },
  async onPost(request) {
    const WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token=242a5cb0d85f95bb608fcb1bcead40fe8152ed50cae24db39f86308bbeba9a70";
    const KEYWORD = ". : lts";
    try {
      const { title, content } = await request.json();
      const text = KEYWORD + "\n" + (content || "");
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
  },
  async onGet(request) {
    return new Response(JSON.stringify({ ok: true, msg: "dingtalk proxy ready, use POST" }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
