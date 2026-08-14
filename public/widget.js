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
    ".iae-card{display:block;overflow:hidden;border-radius:1rem;background:#fff;border:1px solid rgba(15,23,42,.12);box-shadow:0 1px 2px rgba(15,23,42,.06);text-decoration:none;color:inherit;transition:transform .15s ease,box-shadow .15s ease}" +
    ".iae-card:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(15,23,42,.12)}" +
    ".iae-card img{display:block;width:100%;height:10.5rem;object-fit:cover;background:#e2e8f0}" +
    ".iae-card h3{margin:0;padding:.85rem 1rem 1rem;font-size:1rem;line-height:1.35;font-weight:700;color:#0f172a}" +
    ".iae-empty{padding:.75rem 0;font-size:.9rem;opacity:.7}";

  function parseLimit(el) {
    var raw = el.getAttribute("data-limit");
    var n = raw ? parseInt(raw, 10) : 6;
    if (!n || n < 1) return 6;
    return n > 12 ? 12 : n;
  }

  function render(root, posts) {
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
      var a = document.createElement("a");
      a.className = "iae-card";
      a.href = post.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      var img = document.createElement("img");
      img.src = post.image || "";
      img.alt = post.title || "";
      img.loading = "lazy";
      img.decoding = "async";
      a.appendChild(img);

      var h3 = document.createElement("h3");
      h3.textContent = post.title || "";
      a.appendChild(h3);

      grid.appendChild(a);
    });

    root.appendChild(grid);
  }

  function mount(el) {
    var hostname = (el.getAttribute("data-hostname") || "").trim();
    if (!hostname) return;

    var shadow = el.shadowRoot || el.attachShadow({ mode: "open" });
    shadow.innerHTML = '<p class="iae-empty">Carregando matérias…</p>';

    var url = origin + "/api/widget/posts?hostname=" + encodeURIComponent(hostname) + "&limit=" + parseLimit(el);
    fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        render(shadow, data && data.ok && Array.isArray(data.posts) ? data.posts : []);
      })
      .catch(function () {
        render(shadow, []);
      });
  }

  function boot() {
    var nodes = document.querySelectorAll("[data-iae-blog]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
