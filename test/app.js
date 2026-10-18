// Level UP — Phase 0 sign-in test page. No frameworks, no build step.
// The ID token is kept in memory only (never localStorage), so closing the tab signs you out of this page.
(function () {
  'use strict';
  var cfg = window.LEVEL_UP_CONFIG || {};
  var idToken = null;
  var tokenExp = 0;
  var $ = function (id) { return document.getElementById(id); };

  function configProblem() {
    if (!cfg.GOOGLE_CLIENT_ID || cfg.GOOGLE_CLIENT_ID.indexOf('PASTE_') === 0) return 'GOOGLE_CLIENT_ID is not set in config.js.';
    if (!cfg.API_URL || cfg.API_URL.indexOf('PASTE_') === 0) return 'API_URL is not set in config.js.';
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(cfg.API_URL)) return 'API_URL should look like https://script.google.com/macros/s/…/exec';
    return '';
  }

  function decodePayload(jwt) {
    try {
      var part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch (e) { return null; }
  }

  function setSignedIn(signedIn) {
    ['btn-whoami', 'btn-routines', 'btn-admin', 'signout'].forEach(function (id) { $(id).disabled = !signedIn; });
  }

  function renderTokenLife() {
    if (!idToken) { $('token-life').textContent = ''; return; }
    var secs = Math.round(tokenExp - Date.now() / 1000);
    if (secs <= 0) { $('token-life').textContent = 'Your Google sign-in has expired. Sign in again.'; setSignedIn(false); idToken = null; return; }
    $('token-life').textContent = 'Sign-in valid for about ' + Math.ceil(secs / 60) + ' more minutes. The server re-checks it on every call.';
  }

  function onCredential(response) {
    idToken = response.credential;
    var p = decodePayload(idToken) || {};
    tokenExp = p.exp || 0;
    // Display only: the server does the real verification. Never trust this for access decisions.
    $('who').textContent = 'Signed in with Google as ' + (p.email || 'unknown account') + ' (the server has not checked it yet).';
    setSignedIn(true);
    renderTokenLife();
    $('output').textContent = 'Signed in. Choose a server call.';
  }

  async function callApi(action) {
    if (!idToken) { $('output').textContent = 'Sign in first.'; return; }
    renderTokenLife();
    if (!idToken) return;
    var started = performance.now();
    $('latency').textContent = 'Calling…';
    try {
      // text/plain keeps this a "simple" cross-origin request so the browser sends no preflight,
      // which Apps Script web apps cannot answer.
      var res = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, idToken: idToken, requestId: crypto.randomUUID() }),
        redirect: 'follow'
      });
      var text = await res.text();
      var ms = Math.round(performance.now() - started);
      $('latency').textContent = 'Round trip: ' + ms + ' ms';
      try { $('output').textContent = JSON.stringify(JSON.parse(text), null, 2); }
      catch (e) { $('output').textContent = 'The server did not return JSON. Check the deployment settings in README.md (execute as Me, access Anyone, latest version).\n\nFirst 200 characters:\n' + text.slice(0, 200); }
    } catch (e) {
      $('latency').textContent = '';
      $('output').textContent = 'Could not reach the server. Likely causes: wrong API_URL, the web app is not deployed with access “Anyone”, or you have not re-deployed after changing code.';
    }
  }

  function signOut() {
    idToken = null; tokenExp = 0;
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    setSignedIn(false);
    $('who').textContent = 'Not signed in.';
    $('token-life').textContent = '';
    $('output').textContent = 'Signed out.';
    $('latency').textContent = '';
  }

  function initGoogle(attempt) {
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({ client_id: cfg.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: false });
      google.accounts.id.renderButton($('signin-button'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' });
      return;
    }
    if (attempt < 50) setTimeout(function () { initGoogle(attempt + 1); }, 100);
    else $('config-status').textContent = 'Google sign-in script did not load (blocked by network, extension or privacy settings?).';
  }

  window.addEventListener('DOMContentLoaded', function () {
    var problem = configProblem();
    var el = $('config-status');
    if (problem) { el.textContent = problem; el.className = 'status bad'; return; }
    el.textContent = 'Configuration looks complete.'; el.className = 'status ok';
    $('btn-whoami').addEventListener('click', function () { callApi('whoami'); });
    $('btn-routines').addEventListener('click', function () { callApi('listMyRoutines'); });
    $('btn-admin').addEventListener('click', function () { callApi('adminListUsers'); });
    $('signout').addEventListener('click', signOut);
    setInterval(renderTokenLife, 30000);
    initGoogle(0);
  });
})();
