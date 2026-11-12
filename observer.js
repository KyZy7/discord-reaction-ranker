(function () {
  "use strict";
  const core = globalThis.DiscordReactionCore;
  const marker = "discord-reaction-ranker:v1";
  function context(value) {
    const source = core.endpoint(value);
    if (!source) return null;
    const guildId = location.pathname.match(/^\/channels\/(\d{15,22})\//)?.[1];
    return { source, guildId };
  }
  function publish(data, ctx) {
    if (!ctx) return;
    for (const batch of core.normalize(data, ctx.source, ctx.guildId)) {
      window.postMessage({ marker, batch }, "https://discord.com");
    }
  }
  const originalFetch = window.fetch;
  window.fetch = function () {
    // Return the original promise, preserving its exact resolution/rejection behavior.
    const promise = Reflect.apply(originalFetch, this, arguments);
    try {
      const input = arguments[0];
      const ctx = context(typeof input === "string" ? input : input instanceof URL ? input.href : input?.url);
      if (ctx) promise.then(response => {
        if (response.ok) return response.clone().json().then(data => publish(data, ctx));
      }).catch(() => {});
    } catch { /* Observation must never affect the page's request. */ }
    return promise;
  };

  const contexts = new WeakMap();
  const listening = new WeakSet();
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    const result = Reflect.apply(originalOpen, this, arguments);
    try {
      contexts.delete(this);
      const value = arguments[1];
      const ctx = context(typeof value === "string" ? value : value instanceof URL ? value.href : "");
      if (ctx) contexts.set(this, ctx);
      if (!listening.has(this)) {
        listening.add(this);
        this.addEventListener("load", () => {
          try {
            const current = contexts.get(this);
            if (!current || this.status < 200 || this.status >= 300) return;
            if (this.responseType === "json") publish(this.response, current);
            else if (!this.responseType || this.responseType === "text") publish(JSON.parse(this.responseText), current);
          } catch { /* Ignore unsupported or changed response shapes. */ }
        });
      }
    } catch { /* Leave native XHR behavior intact. */ }
    return result;
  };
})();
