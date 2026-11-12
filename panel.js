(function () {
  "use strict";
  const core = globalThis.DiscordReactionCore;
  let state = { version: 1, forums: {} };
  let selected = "";
  let status = "";
  let savedNames = {};
  let namesChanged = false;
  const expandedRows = new Set();
  let render = () => {};
  let refreshNames = () => {};
  async function send(request) {
    try {
      const reply = await chrome.runtime.sendMessage(request);
      status = reply?.error || "";
    } catch { status = "Extension disconnected. Reload Discord to reconnect."; }
    render();
  }
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== "https://discord.com"
      || event.data?.marker !== "discord-reaction-ranker:v1") return;
    const batch = core.validate(event.data.batch);
    if (batch) {
      core.merge(state, batch);
      applyNames();
      render();
      refreshNames();
    }
  });
  function applyNames() {
    for (const [key, forum] of Object.entries(state.forums)) {
      if (typeof savedNames[key] === "string") forum.name = savedNames[key];
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.forumNames) {
      namesChanged = true;
      savedNames = changes.forumNames.newValue || {};
      applyNames();
      render();
      refreshNames();
    }
  });

  function mount() {
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;color-scheme:dark;font:14px/1.45 system-ui,sans-serif;color:#f0f2f6";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { font:14px/1.45 system-ui,sans-serif; color:#f0f2f6 }
      * { box-sizing:border-box } button,select,input { font:inherit }
      button,select,input { border:1px solid #555d70;border-radius:7px;background:#303646;color:#fff;padding:6px 8px }
      button,select { cursor:pointer } input { width:100%;margin-top:6px } input::placeholder { color:#bcc3d4 }
      button:hover { background:#414b62 } button:focus-visible,select:focus-visible,input:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid #aabaff;outline-offset:2px }
      .toggle { box-shadow:0 4px 20px #0007;background:#454fb0 }
      section { width:min(420px,calc(100vw - 32px));height:calc(100vh - 90px);background:#202431;border:1px solid #596176;border-radius:12px;box-shadow:0 8px 32px #0008;display:flex;flex-direction:column;margin-bottom:10px;overflow:hidden }
      section[hidden] { display:none } header { padding:10px 12px;border-bottom:1px solid #434a5c;flex-shrink:0 } h2 { font-size:16px;margin:0 0 6px }
      select { width:100% } p { margin:5px 0 0 } .muted { color:#bcc3d4;font-size:12px } .error { color:#ffb4b4 }
      .counts { font-size:12px } summary { cursor:pointer;color:#bcc3d4;font-size:12px } details { margin-top:4px }
      .about p { font-size:12px;color:#bcc3d4 }
      .list { overflow:auto;flex:1;min-height:0;padding:0 12px;overscroll-behavior:contain } article { padding:9px 0;border-bottom:1px solid #434a5c;overflow-wrap:anywhere }
      .title { font-weight:650;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden }
      article:has(details[open]) .title { display:block;-webkit-line-clamp:unset;overflow:visible }
      .meta { display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px;margin-top:3px }
      .meta .author { min-width:0;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
      .meta a { margin-left:auto;white-space:nowrap } .total { color:#bcc8ff;font-weight:700 } .emoji { margin-top:5px;color:#d2d7e2;font-size:12px }
      a { color:#b9c7ff } .empty { padding:18px 0 }
    `;
    function element(tag, value, className) {
      const node = document.createElement(tag);
      if (value !== undefined) node.textContent = value;
      if (className) node.className = className;
      return node;
    }
    const section = element("section");
    section.id = "ranking";
    section.setAttribute("aria-label", "Discord reaction rankings");
    section.hidden = true;
    const header = element("header");
    header.append(element("h2", "Thread reaction rankings"));
    const select = element("select");
    select.setAttribute("aria-label", "Collected forum");
    select.addEventListener("change", () => { selected = select.value; render(); });
    const search = element("input");
    search.type = "search";
    search.value = "";
    search.placeholder = "Search titles, authors, and post text";
    search.setAttribute("aria-label", "Search collected rankings");
    search.addEventListener("input", () => { list.scrollTop = 0; render(); });
    const matches = element("p", "", "muted");
    matches.setAttribute("role", "status");
    const counts = element("p", "", "counts");
    const coverage = element("p", "", "muted");
    const about = element("details", undefined, "about");
    about.append(element("summary", "About these rankings"), coverage, element("p", "Scroll the forum in Discord to collect more posts. Counts reflect opening posts last observed, not live totals.", "muted"));
    header.append(select, search, matches, counts, about);
    const error = element("p", "", "error");
    error.setAttribute("role", "status");
    header.append(error);
    const list = element("div", undefined, "list");
    section.append(header, list);
    const toggle = element("button", "Reaction rankings", "toggle");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "ranking");
    toggle.addEventListener("click", () => {
      section.hidden = !section.hidden;
      toggle.setAttribute("aria-expanded", String(!section.hidden));
    });
    shadow.append(style, section, toggle);
    document.documentElement.append(host);

    function createRankingRow(row, forum) {
      const article = element("article");
      const message = row.message;
      const title = row.title || message?.preview || `Thread ${row.id}`;
      article.append(element("div", `${message ? `${row.rank}. ` : ""}${title}`, "title"));
      const meta = element("div", undefined, "meta");
      meta.append(element("span", message ? `${message.total.toLocaleString()} reactions` : "Unavailable", "total"));
      if (message) {
        const author = element("span", message.author || "Unknown author", "muted author");
        author.title = message.author || "Unknown author";
        meta.append(author);
      }
      const link = element("a", "Open in Discord");
      link.href = `https://discord.com/channels/${forum.guildId}/${row.id}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      meta.append(link);
      const details = element("details");
      const rowKey = `${selected}/${row.id}`;
      details.setAttribute("data-row-key", rowKey);
      details.open = expandedRows.has(rowKey);
      details.addEventListener("toggle", () => {
        // Replaced/disconnected disclosures may still have queued toggle events.
        if (!details.isConnected) return;
        if (details.open) expandedRows.add(rowKey);
        else expandedRows.delete(rowKey);
      });
      details.append(element("summary", "Details"));
      if (message) {
        if (message.preview) details.append(element("p", message.preview, "muted"));
        details.append(element("div", message.reactions.length ? message.reactions.map(r => `${r.emoji} ${r.count}`).join(" · ") : "No reactions", "emoji"));
        details.append(element("p", `Last observed: ${new Date(message.observedAt).toLocaleString()}`, "muted"));
      } else details.append(element("p", "Opening message not observed.", "muted"));
      article.append(meta, details);
      return article;
    }

    render = () => {
      const keys = Object.keys(state.forums).sort();
      const current = location.pathname.match(/^\/channels\/(\d+)\/(\d+)/);
      const currentKey = current ? `${current[1]}/${current[2]}` : "";
      if (!state.forums[selected]) selected = keys.includes(currentKey) ? currentKey : keys[0] || "";
      select.replaceChildren();
      if (!keys.length) {
        const option = element("option", "No forums collected yet");
        option.value = "";
        select.append(option);
      }
      for (const key of keys) {
        const forum = state.forums[key];
        const option = element("option", forum.name || "Unknown forum");
        option.value = key;
        option.title = `Forum ${forum.forumId} · Server ${forum.guildId}`;
        select.append(option);
      }
      select.value = selected;
      select.disabled = !keys.length;
      const forum = state.forums[selected];
      const rankedRows = core.ranked(forum);
      const query = search.value.trim().toLowerCase();
      // Assign ranks before filtering so both order and original rank numbers stay intact.
      const rows = rankedRows.map((row, index) => ({ ...row, rank: index + 1 })).filter(row =>
        !query || [row.title, row.message?.author, row.message?.preview]
          .some(value => (value || "").toLowerCase().includes(query)));
      const usable = rankedRows.filter(row => row.message).length;
      counts.textContent = `${rankedRows.length} discovered · ${usable} ranked · ${rankedRows.length - usable} unavailable`;
      matches.hidden = !query;
      matches.textContent = query ? `${rows.length} of ${rankedRows.length} collected threads match · reaction order preserved` : "";
      coverage.textContent = forum?.searchTotal !== undefined
        ? `Last observed search: ${forum.searchTotal} matching threads. This may be a filtered subset; collection is not guaranteed complete.`
        : "Coverage includes only threads observed in this browser.";
      error.textContent = status;
      error.hidden = !status;
      // Read current DOM state too: native toggle events are delivered asynchronously.
      for (const disclosure of list.querySelectorAll?.("details[data-row-key]") || []) {
        const key = disclosure.getAttribute("data-row-key");
        if (disclosure.open) expandedRows.add(key);
        else expandedRows.delete(key);
      }
      list.replaceChildren();
      if (!rows.length) list.append(element("p", query
        ? "No collected threads match your search. Clear the search to show all rankings."
        : "Open a Discord forum and browse its posts. If nothing appears, reload Discord with this extension enabled.", "empty"));
      for (const row of rows) list.append(createRankingRow(row, forum));
    };
    render();
    refreshNames = globalThis.DiscordForumNames.watch(() => state.forums, names => send({ type: "forumNames", names }));
    // Rankings belong to this document only. Remove the old persistent cache.
    chrome.storage.local.remove("rankingState").catch(() => {});
    chrome.storage.local.get("forumNames").then(result => {
      // A newer storage event may arrive while this initial read is in flight.
      if (!namesChanged) savedNames = result.forumNames || {};
      applyNames();
      render();
      refreshNames();
    }).catch(() => { status = "Could not load saved forum names."; render(); });
  }
  if (document.documentElement) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
