/*! Webchat DataCrazy — loader. Cole no site: <script src="https://SEU-PROJETO.vercel.app/widget.js" async></script>
 *
 * Opcional no <script>: data-position="left|right", data-color="#2563eb", data-text="Fale conosco",
 * data-open="5" (abre sozinho depois de N segundos).
 * API: window.DCWebchat.open(), .close(), .toggle(), .identify({ name, email, phone })
 * Eventos na página: "dcwebchat:open", "dcwebchat:close", "dcwebchat:lead" (formulário enviado).
 */
(function () {
  "use strict";
  if (window.DCWebchat && window.DCWebchat.__loaded) return;

  var script = document.currentScript;
  var chatOrigin = script && script.src ? new URL(script.src).origin : location.origin;
  var data = (script && script.dataset) || {};
  var SOURCE = "dcwebchat";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  var state = { open: false, wantOpen: false, ready: false, unread: 0, pendingIdentify: null, title: document.title, blink: null };
  var host, shadow, launcher, badge, frameWrap, iframe;

  function post(message) {
    if (!iframe || !iframe.contentWindow) return;
    message.source = SOURCE;
    iframe.contentWindow.postMessage(message, chatOrigin);
  }

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (e) {}
  }

  function contrastText(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#ffffff";
    var n = parseInt(m[1], 16);
    var lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? "#0f172a" : "#ffffff";
  }

  function render(config) {
    var appearance = (config && config.appearance) || {};
    // Only #RRGGBB values reach the stylesheet below.
    var isHex = function (value) {
      return /^#[0-9a-f]{6}$/i.test(value || "");
    };
    var color = isHex(data.color) ? data.color : isHex(appearance.primaryColor) ? appearance.primaryColor : "#2563eb";
    var onColor = isHex(data.color) ? contrastText(color) : isHex(appearance.textOnPrimary) ? appearance.textOnPrimary : "#ffffff";
    var side = (data.position || appearance.position) === "left" ? "left" : "right";
    var text = data.text != null ? data.text : appearance.launcherText || "";

    host = document.createElement("div");
    host.setAttribute("data-dcwebchat", "");
    shadow = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      ".launcher{position:fixed;" +
      side +
      ":20px;bottom:20px;z-index:2147483001;height:60px;min-width:60px;padding:0 " +
      (text ? "22px 0 18px" : "0") +
      ";border:0;border-radius:30px;" +
      "background:" +
      color +
      ";color:" +
      onColor +
      ";cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;font:600 15px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "box-shadow:0 10px 30px rgba(15,23,42,.28);transition:transform .2s,opacity .2s;-webkit-tap-highlight-color:transparent}" +
      ".launcher:hover{transform:scale(1.05)}.launcher:active{transform:scale(.95)}" +
      ".launcher:focus-visible{outline:3px solid " +
      color +
      ";outline-offset:3px}" +
      ".launcher svg{width:26px;height:26px;flex:none}" +
      ".badge{position:absolute;top:-4px;" +
      (side === "right" ? "right" : "left") +
      ":-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#dc2626;color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center;box-sizing:border-box}" +
      ".frame{position:fixed;" +
      side +
      ":20px;bottom:92px;z-index:2147483000;width:380px;height:min(640px,calc(100dvh - 116px));border-radius:16px;overflow:hidden;" +
      "box-shadow:0 24px 60px rgba(15,23,42,.30),0 2px 8px rgba(15,23,42,.12);opacity:0;visibility:hidden;transform:translateY(12px) scale(.98);transform-origin:bottom " +
      side +
      ";" +
      "transition:opacity .2s,transform .25s cubic-bezier(.2,0,0,1),visibility 0s linear .25s;background:#fff}" +
      ".frame.is-open{opacity:1;visibility:visible;transform:none;transition:opacity .2s,transform .25s cubic-bezier(.2,0,0,1),visibility 0s}" +
      ".frame iframe{width:100%;height:100%;border:0;display:block}" +
      "[hidden]{display:none!important}" +
      "@media (max-width:480px){.frame{inset:0;top:var(--vv-top,0px);width:100%;height:var(--vv-h,100dvh);border-radius:0}.launcher.is-open{opacity:0;pointer-events:none}}" +
      "@media (prefers-reduced-motion:reduce){.launcher,.frame{transition:none}}" +
      "</style>" +
      '<div class="frame" role="dialog" aria-label="Chat de atendimento"></div>' +
      '<button class="launcher" type="button" aria-expanded="false" aria-label="Abrir chat de atendimento">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      (text ? "<span></span>" : "") +
      '<span class="badge" hidden aria-hidden="true"></span></button>';

    launcher = shadow.querySelector(".launcher");
    badge = shadow.querySelector(".badge");
    frameWrap = shadow.querySelector(".frame");
    if (text) launcher.querySelector("span").textContent = text;
    launcher.addEventListener("click", function () {
      state.open ? close() : open();
    });
    document.body.appendChild(host);

    // Visible area on mobile (keyboard open): keeps the input above the keyboard.
    if (window.visualViewport) {
      var vv = window.visualViewport;
      var sync = function () {
        host.style.setProperty("--vv-h", vv.height + "px");
        host.style.setProperty("--vv-top", vv.offsetTop + "px");
      };
      vv.addEventListener("resize", sync);
      vv.addEventListener("scroll", sync);
    }

    var autoOpen = Number(data.open != null ? data.open : appearance.autoOpenSeconds) || 0;
    var alreadyOpened = false;
    try {
      alreadyOpened = Boolean(sessionStorage.getItem("dcwebchat:autoopened"));
    } catch (e) {}
    if (autoOpen > 0 && !alreadyOpened) {
      setTimeout(function () {
        try {
          sessionStorage.setItem("dcwebchat:autoopened", "1");
        } catch (e) {}
        open();
      }, autoOpen * 1000);
    }

    // The iframe loads in the background so replies (and the unread badge) arrive even while closed.
    var idle =
      window.requestIdleCallback ||
      function (fn) {
        return setTimeout(fn, 1200);
      };
    idle(ensureFrame);
    if (state.wantOpen) open();
  }

  function ensureFrame() {
    if (iframe) return;
    var params = new URLSearchParams();
    params.set("host", location.origin);
    // Without query string: it may carry tokens or e-mails of the site. UTMs are read separately below.
    params.set("page", (location.origin + location.pathname).slice(0, 1500));
    // Only the origin of the referrer: its path and query belong to another site and may carry personal data.
    if (document.referrer) {
      try {
        params.set("ref", new URL(document.referrer).origin);
      } catch (e) {}
    }
    var query = new URLSearchParams(location.search);
    UTM_KEYS.forEach(function (key) {
      var value = query.get(key);
      if (value) params.set(key, value.slice(0, 200));
    });
    iframe = document.createElement("iframe");
    iframe.title = "Chat de atendimento";
    iframe.allow = "microphone; clipboard-write";
    // Hash, not query: page and UTMs never hit server logs.
    iframe.src = chatOrigin + "/embed#" + params.toString();
    frameWrap.appendChild(iframe);
  }

  function setUnread(count) {
    state.unread = count;
    badge.hidden = count === 0;
    badge.textContent = count > 9 ? "9+" : String(count);
    if (count > 0 && !state.blink) {
      var on = false;
      state.blink = setInterval(function () {
        on = !on;
        document.title = on ? "(" + state.unread + ") Nova mensagem" : state.title;
      }, 1200);
    } else if (count === 0 && state.blink) {
      clearInterval(state.blink);
      state.blink = null;
      document.title = state.title;
    }
  }

  function open() {
    // Called before the launcher exists (API used right on page load): open as soon as it renders.
    if (!launcher) {
      state.wantOpen = true;
      return;
    }
    ensureFrame();
    state.open = true;
    frameWrap.classList.add("is-open");
    launcher.classList.add("is-open");
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", "Fechar chat de atendimento");
    setUnread(0);
    post({ type: "open" });
    emit("dcwebchat:open");
  }

  function close() {
    state.wantOpen = false;
    if (!launcher) return;
    state.open = false;
    frameWrap.classList.remove("is-open");
    launcher.classList.remove("is-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Abrir chat de atendimento");
    post({ type: "close" });
    launcher.focus();
    emit("dcwebchat:close");
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== chatOrigin || !event.data || event.data.source !== SOURCE) return;
    var msg = event.data;
    if (msg.type === "ready") {
      state.ready = true;
      post({ type: state.open ? "open" : "close" });
      if (state.pendingIdentify) post({ type: "identify", data: state.pendingIdentify });
    } else if (msg.type === "unread" && !state.open) {
      setUnread(Number(msg.count) || 0);
    } else if (msg.type === "close") {
      close();
    } else if (msg.type === "lead") {
      emit("dcwebchat:lead", {});
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.open) close();
  });
  window.addEventListener("focus", function () {
    if (state.open) setUnread(0);
  });

  window.DCWebchat = {
    __loaded: true,
    open: open,
    close: close,
    toggle: function () {
      state.open ? close() : open();
    },
    identify: function (visitor) {
      var clean = {};
      ["name", "email", "phone"].forEach(function (key) {
        if (visitor && typeof visitor[key] === "string") clean[key] = visitor[key].slice(0, 200);
      });
      state.pendingIdentify = clean;
      if (state.ready) post({ type: "identify", data: clean });
    },
  };

  function start() {
    fetch(chatOrigin + "/api/widget/config")
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(render);
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
