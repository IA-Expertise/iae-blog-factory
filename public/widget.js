(function () {
  if (window.__iaeBlogWidgetLoaded) return;
  window.__iaeBlogWidgetLoaded = true;

  var script = document.currentScript;
  var origin = "";
  if (script && script.src) {
    try {
      origin = new URL(script.src).origin;
    } catch (e) {
      origin = "";
    }
  }
  if (!origin) origin = window.location.origin;

  var css =
    ":host{display:block;font-family:inherit;color:inherit}" +
    ".iae-grid{display:grid;grid-template-columns:1fr;gap:1rem}" +
    "@media(min-width:640px){.iae-grid{grid-template-columns:1fr 1fr}}" +
    "@media(min-width:960px){.iae-grid{grid-template-columns:1fr 1fr 1fr}}" +
    ".iae-card{display:block;overflow:hidden;border-radius:1rem;background:#fff;border:1px solid rgba(15,23,42,.12);box-shadow:0 1px 2px rgba(15,23,42,.06);text-decoration:none;color:inherit;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;width:100%;text-align:left;padding:0;font:inherit}" +
    ".iae-card:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(15,23,42,.12)}" +
    ".iae-card img{display:block;width:100%;height:10.5rem;object-fit:cover;background:#e2e8f0}" +
    ".iae-card h3{margin:0;padding:.85rem 1rem 1rem;font-size:1rem;line-height:1.35;font-weight:700;color:#0f172a}" +
    ".iae-empty{padding:.75rem 0;font-size:.9rem;opacity:.7}";

  var overlayCss =
    "#iae-blog-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;background:rgba(15,23,42,.72);backdrop-filter:blur(2px)}" +
    "#iae-blog-overlay[hidden]{display:none!important}" +
    "#iae-blog-overlay *{box-sizing:border-box}" +
    "#iae-blog-overlay .iae-panel{position:relative;width:min(720px,100%);max-height:min(90vh,900px);overflow:auto;background:#fff;color:#0f172a;border-radius:1rem;box-shadow:0 25px 50px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    "#iae-blog-overlay .iae-close{position:sticky;top:0;float:right;z-index:2;margin:.75rem .75rem 0 0;border:0;border-radius:999px;width:2.5rem;height:2.5rem;background:#0f172a;color:#fff;font-size:1.35rem;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}" +
    "#iae-blog-overlay .iae-close:hover{background:#334155}" +
    "#iae-blog-overlay .iae-body{padding:0 1.25rem 1.5rem;clear:both}" +
    "#iae-blog-overlay .iae-meta{font-size:.8rem;color:#64748b;margin:0 0 .35rem}" +
    "#iae-blog-overlay .iae-title{margin:0 0 .75rem;font-size:1.45rem;line-height:1.25}" +
    "#iae-blog-overlay .iae-cover{display:block;width:100%;max-height:18rem;object-fit:cover;border-radius:.75rem;margin:0 0 1rem;background:#e2e8f0}" +
    "#iae-blog-overlay .iae-video{margin:0 0 1rem;overflow:hidden;border-radius:.75rem;background:#0f172a}" +
    "#iae-blog-overlay .iae-video iframe{display:block;width:100%;aspect-ratio:16/9;height:auto;border:0}" +
    "#iae-blog-overlay .iae-video[data-provider='instagram'] iframe,#iae-blog-overlay .iae-video[data-provider='facebook'] iframe{aspect-ratio:9/16;max-height:36rem;margin:0 auto}" +
    "#iae-blog-overlay .iae-content{font-size:1.05rem;line-height:1.65;color:#1e293b}" +
    "#iae-blog-overlay .iae-content h2{font-size:1.2rem;margin:1.4rem 0 .6rem}" +
    "#iae-blog-overlay .iae-content h3{font-size:1.08rem;margin:1.2rem 0 .5rem}" +
    "#iae-blog-overlay .iae-content p{margin:.75rem 0}" +
    "#iae-blog-overlay .iae-content a{color:#0369a1}" +
    "#iae-blog-overlay .iae-content img{max-width:100%;height:auto;border-radius:.5rem}" +
    "#iae-blog-overlay .iae-loading,#iae-blog-overlay .iae-error{padding:2.5rem 1.25rem;text-align:center;color:#64748b}" +
    "#iae-blog-overlay .iae-error{color:#b91c1c}";

  var hostnameByRoot = new WeakMap();
  var lastFocus = null;
  var previousOverflow = "";
  var scrollLocked = false;

  function ensureOverlay() {
    var existing = document.getElementById("iae-blog-overlay");
    if (existing) return existing;

    var style = document.createElement("style");
    style.id = "iae-blog-overlay-style";
    style.textContent = overlayCss;
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = "iae-blog-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div class="iae-panel">' +
      '<button type="button" class="iae-close" aria-label="Fechar">×</button>' +
      '<div class="iae-body" data-iae-overlay-body></div>' +
      "</div>";
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) closeOverlay();
    });
    overlay.querySelector(".iae-close").addEventListener("click", function (ev) {
      ev.preventDefault();
      closeOverlay();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !overlay.hidden) closeOverlay();
    });

    return overlay;
  }

  function lockScroll() {
    if (scrollLocked) return;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    scrollLocked = true;
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    document.body.style.overflow = previousOverflow || "";
    document.documentElement.style.overflow = "";
    previousOverflow = "";
    scrollLocked = false;
  }

  function openOverlay() {
    var overlay = ensureOverlay();
    lastFocus = document.activeElement;
    lockScroll();
    overlay.hidden = false;
    var closeBtn = overlay.querySelector(".iae-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeOverlay() {
    var overlay = document.getElementById("iae-blog-overlay");
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    unlockScroll();
    if (lastFocus && typeof lastFocus.focus === "function") {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }

  function setOverlayLoading() {
    var overlay = ensureOverlay();
    var body = overlay.querySelector("[data-iae-overlay-body]");
    if (body) body.innerHTML = '<p class="iae-loading">Carregando matéria…</p>';
    openOverlay();
  }

  function setOverlayError(msg) {
    var overlay = ensureOverlay();
    var body = overlay.querySelector("[data-iae-overlay-body]");
    if (body) body.innerHTML = '<p class="iae-error">' + (msg || "Não foi possível abrir a matéria.") + "</p>";
    openOverlay();
  }

  function setOverlayPost(post) {
    var overlay = ensureOverlay();
    var body = overlay.querySelector("[data-iae-overlay-body]");
    if (!body) return;

    var meta = [];
    if (post.brandName) meta.push(post.brandName);
    if (post.category) meta.push(post.category);
    if (post.publishedAt) meta.push(post.publishedAt);

    var html = "";
    if (meta.length) html += '<p class="iae-meta">' + escapeHtml(meta.join(" · ")) + "</p>";
    html += "<h1 class=\"iae-title\">" + escapeHtml(post.title || "") + "</h1>";
    if (post.image) {
      html +=
        '<img class="iae-cover" src="' +
        escapeAttr(post.image) +
        '" alt="' +
        escapeAttr(post.title || "") +
        '">';
    }
    if (post.videoHtml) {
      html += post.videoHtml;
    }
    html += '<div class="iae-content">' + (post.html || "") + "</div>";
    body.innerHTML = html;
    openOverlay();
    body.scrollTop = 0;
    overlay.querySelector(".iae-panel").scrollTop = 0;
    hydrateSocialEmbeds(body);
  }

  function hydrateSocialEmbeds(root) {
    if (root.querySelector(".twitter-tweet")) {
      loadExternalScript("https://platform.twitter.com/widgets.js", function () {
        if (window.twttr && window.twttr.widgets) window.twttr.widgets.load(root);
      });
    }
    if (root.querySelector(".tiktok-embed")) {
      loadExternalScript("https://www.tiktok.com/embed.js");
    }
  }

  function loadExternalScript(src, onload) {
    var existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (onload) onload();
      return;
    }
    var s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (onload) s.onload = onload;
    document.body.appendChild(s);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/'/g, "&#39;");
  }

  function parseLimit(el) {
    var raw = el.getAttribute("data-limit");
    var n = raw ? parseInt(raw, 10) : 6;
    if (!n || n < 1) return 6;
    return n > 12 ? 12 : n;
  }

  function openPost(hostname, slug) {
    if (!hostname || !slug) return;
    setOverlayLoading();
    var url =
      origin +
      "/api/widget/post?hostname=" +
      encodeURIComponent(hostname) +
      "&slug=" +
      encodeURIComponent(slug);
    fetch(url)
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok && result.data.post) {
          setOverlayPost(result.data.post);
        } else {
          setOverlayError("Matéria não encontrada.");
        }
      })
      .catch(function () {
        setOverlayError("Falha ao carregar a matéria.");
      });
  }

  function render(root, hostname, posts) {
    root.innerHTML = "";
    var style = document.createElement("style");
    style.textContent = css;
    root.appendChild(style);

    if (!posts.length) {
      var empty = document.createElement("p");
      empty.className = "iae-empty";
      empty.textContent = "Nenhuma matéria publicada ainda.";
      root.appendChild(empty);
      return;
    }

    var grid = document.createElement("div");
    grid.className = "iae-grid";

    posts.forEach(function (post) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "iae-card";

      var img = document.createElement("img");
      img.src = post.image || "";
      img.alt = post.title || "";
      img.loading = "lazy";
      img.decoding = "async";
      btn.appendChild(img);

      var h3 = document.createElement("h3");
      h3.textContent = post.title || "";
      btn.appendChild(h3);

      btn.addEventListener("click", function () {
        openPost(hostname, post.slug);
      });

      grid.appendChild(btn);
    });

    root.appendChild(grid);
  }

  function mount(el) {
    var hostname = (el.getAttribute("data-hostname") || "").trim();
    if (!hostname) return;
    hostnameByRoot.set(el, hostname);

    var shadow = el.shadowRoot || el.attachShadow({ mode: "open" });
    shadow.innerHTML = '<p class="iae-empty">Carregando matérias…</p>';

    var url = origin + "/api/widget/posts?hostname=" + encodeURIComponent(hostname) + "&limit=" + parseLimit(el);
    fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        render(shadow, hostname, data && data.ok && Array.isArray(data.posts) ? data.posts : []);
      })
      .catch(function () {
        render(shadow, hostname, []);
      });
  }

  function boot() {
    ensureOverlay();
    var nodes = document.querySelectorAll("[data-iae-blog]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
