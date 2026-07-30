/**
 * Single-file operator console. Served from memory so the service stays a
 * single process with no static asset pipeline; it never receives Docmost or
 * WeChat secrets, only the Publisher access token the operator types in.
 */
export const consoleHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Docmost Publisher</title>
  <style>
    :root{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;color:#e2e8f0;background:#07111f}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 0,#12314a 0,transparent 35%),#07111f}
    main{width:min(760px,calc(100% - 32px));margin:56px auto;padding:32px;border:1px solid #1e3a4f;border-radius:18px;background:rgba(10,25,41,.92);box-shadow:0 24px 70px #0008}
    .eyebrow{color:#5eead4;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}h1{margin:.35em 0;font-size:34px}p{color:#94a3b8;line-height:1.7}
    form{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px}label{display:grid;gap:7px;color:#cbd5e1;font-size:13px}.wide{grid-column:1/-1}
    input,select,textarea{width:100%;padding:12px 13px;color:#f8fafc;background:#0b1b2b;border:1px solid #27445b;border-radius:9px;outline:0}input:focus,select:focus,textarea:focus{border-color:#2dd4bf;box-shadow:0 0 0 3px #2dd4bf20}
    .checks{display:flex;gap:24px}.checks label{display:flex;grid-auto-flow:column;align-items:center;justify-content:start}.checks input{width:auto}
    button{grid-column:1/-1;padding:13px;border:0;border-radius:10px;color:#042f2e;background:#5eead4;font-weight:800;cursor:pointer}button:disabled{opacity:.55}
    pre{display:none;grid-column:1/-1;white-space:pre-wrap;padding:14px;color:#a7f3d0;background:#06101b;border:1px solid #1e3a4f;border-radius:9px}
    @media(max-width:620px){main{margin:20px auto;padding:22px}form{grid-template-columns:1fr}.wide,button{grid-column:1}}
  </style>
</head>
<body><main>
  <div class="eyebrow">Draft-only connector</div>
  <h1>发布到微信公众号草稿</h1>
  <p>正文只从 Docmost 读取。提交前会检查不支持的节点、正文哈希、图片与图表；最终发布仍在微信后台人工完成。</p>
  <form id="form">
    <label class="wide">Publisher 访问令牌<input name="publisherToken" type="password" autocomplete="current-password" placeholder="PUBLISHER_AUTH_ENABLED=1 时必填"></label>
    <label class="wide">Docmost 页面 UUID<input name="pageId" required placeholder="019fabe2-2a4d-7ee9-b9de-1c4dfbedcacd"></label>
    <label class="wide">微信公众号<select name="accountId" required><option value="">请选择账号</option></select></label>
    <label>作者<input name="author" required maxlength="64"></label>
    <label>原文链接<input name="contentSourceUrl" type="url"></label>
    <label class="wide">摘要<textarea name="digest" maxlength="120" rows="3"></textarea></label>
    <div class="checks wide">
      <label><input name="needOpenComment" type="checkbox">开启评论</label>
      <label><input name="onlyFansCanComment" type="checkbox">仅粉丝评论</label>
    </div>
    <button>创建草稿</button><pre id="result"></pre>
  </form>
</main><script>
const form=document.querySelector('#form');const result=document.querySelector('#result');
const authHeaders=()=>{const token=String(form.publisherToken.value||'');return token?{authorization:'Bearer '+token}:{}};
const loadAccounts=async()=>{try{const response=await fetch('/api/accounts',{headers:authHeaders()});if(!response.ok)return;const selected=form.accountId.value;const body=await response.json();form.accountId.replaceChildren(new Option('请选择账号',''));for(const account of body.accounts||[]){form.accountId.add(new Option(account.name,account.id))}form.accountId.value=selected}catch{}};
const loadConfig=async()=>{const pageId=String(form.pageId.value||'');if(!/^[0-9a-f-]{36}$/i.test(pageId))return;try{const response=await fetch('/api/config/'+encodeURIComponent(pageId),{headers:authHeaders()});if(!response.ok)return;const body=await response.json();const saved=body.config;if(!saved)return;form.accountId.value=saved.accountId||'';form.author.value=saved.author||'';form.digest.value=saved.digest||'';form.contentSourceUrl.value=saved.contentSourceUrl||form.contentSourceUrl.value||'';form.needOpenComment.checked=Boolean(saved.needOpenComment);form.onlyFansCanComment.checked=Boolean(saved.onlyFansCanComment)}catch{}};
form.pageId.addEventListener('change',loadConfig);form.publisherToken.addEventListener('change',()=>{loadAccounts();loadConfig()});
// Prefill from the Docmost page header entry point: /?pageId=...&contentSourceUrl=...
const params=new URLSearchParams(location.search);const linkedPageId=String(params.get('pageId')||'');const linkedSourceUrl=String(params.get('contentSourceUrl')||'');
loadAccounts();if(/^[0-9a-f-]{36}$/i.test(linkedPageId)){form.pageId.value=linkedPageId;if(/^https?:\\/\\//i.test(linkedSourceUrl))form.contentSourceUrl.value=linkedSourceUrl;form.publisherToken.focus();loadConfig()}
form.addEventListener('submit',async(e)=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;result.style.display='block';result.textContent='处理中…';
const data=Object.fromEntries(new FormData(form));const publisherToken=String(data.publisherToken||'');delete data.publisherToken;data.needOpenComment=form.needOpenComment.checked;data.onlyFansCanComment=form.onlyFansCanComment.checked;
try{const headers={'content-type':'application/json'};if(publisherToken)headers.authorization='Bearer '+publisherToken;const response=await fetch('/api/publications',{method:'POST',headers,body:JSON.stringify(data)});const body=await response.json();result.textContent=JSON.stringify(body,null,2)}catch(error){result.textContent=String(error)}finally{button.disabled=false}});
</script></body></html>`;
