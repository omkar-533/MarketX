/** HTML callback — reads auth_code from query OR hash (Fyers often uses #). */
export function fyersCallbackHtml({ appUrl, apiConnectPath = '/api/fyers/connect' }) {
  const safeApp = JSON.stringify(appUrl);
  const safeApi = JSON.stringify(apiConnectPath);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>TradeX Connect</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0e1a;color:#e2e8f0;padding:2rem;max-width:32rem;margin:0 auto}
input,button{width:100%;padding:0.6rem;margin:0.4rem 0;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0}
button{background:#ca8a04;color:#0a0e1a;font-weight:700;border:none;cursor:pointer}
.err{color:#f87171}.ok{color:#86efac}</style></head>
<body>
<h2>TradeX login</h2>
<p id="status">Processing redirect…</p>
<input id="manual" type="text" placeholder="Paste full redirect URL or auth_code" style="display:none"/>
<button id="btn" type="button" style="display:none">Connect manually</button>
<script>
(function(){
  var statusEl = document.getElementById('status');
  var manual = document.getElementById('manual');
  var btn = document.getElementById('btn');
  var appUrl = ${safeApp};
  var apiPath = ${safeApi};

  function pickCode(href) {
    try {
      var u = new URL(href || location.href);
      var keys = ['auth_code','code','authCode'];
      for (var i=0;i<keys.length;i++) {
        var q = u.searchParams.get(keys[i]);
        if (q && q.trim()) return q.trim();
      }
      var hash = (u.hash || '').replace(/^#/, '');
      if (hash) {
        var hp = new URLSearchParams(hash);
        for (var j=0;j<keys.length;j++) {
          var h = hp.get(keys[j]);
          if (h && h.trim()) return h.trim();
        }
        var m = hash.match(/(?:^|&)auth_code=([^&]+)/i);
        if (m && m[1]) return decodeURIComponent(m[1]).trim();
      }
      var pasted = (href || '').match(/[?&#]auth_code=([^&#]+)/i);
      if (pasted && pasted[1]) return decodeURIComponent(pasted[1]).trim();
    } catch (e) {}
    return '';
  }

  function showManual(msg) {
    statusEl.innerHTML = '<span class="err">' + msg + '</span>';
    manual.style.display = 'block';
    btn.style.display = 'block';
  }

  function connect(code) {
    statusEl.textContent = 'Connecting…';
    fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_code: code })
    }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res) {
        if (res.ok) {
          statusEl.innerHTML = '<span class="ok">TradeX connected ✓ Redirecting…</span>';
          setTimeout(function(){ location.href = appUrl; }, 1200);
        } else {
          showManual((res.d && res.d.error) || 'Token exchange failed');
        }
      })
      .catch(function() {
        showManual('TradeX server offline — terminal mein npm run dev chalao, phir dubara login');
      });
  }

  btn.onclick = function() {
    var raw = (manual.value || '').trim();
    if (!raw) { showManual('Paste auth_code or full redirect URL'); return; }
    var code = pickCode(raw.indexOf('auth_code') >= 0 ? raw : 'http://x/?auth_code=' + raw);
    if (!code) code = raw;
    connect(code);
  };

  var params = new URLSearchParams(location.search);
  var err = params.get('error') || params.get('message') || (params.get('s') === 'error' ? 'Fyers returned an error' : '');
  if (err) { showManual(err); return; }

  var code = pickCode(location.href);
  if (code) { connect(code); return; }

  showManual('auth_code not in URL. After Fyers login, copy the full address bar URL and paste below — or use Connect in the app.');
})();
</script>
</body></html>`;
}
