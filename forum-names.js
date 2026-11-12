(function () {
  "use strict";
  function discover(forums, document) {
    const found = new Map();
    // Channel navigation links, excluding ordinary links in messages/posts.
    const links = document.querySelectorAll('a[data-list-item-id^="channels___"][href], [data-list-item-id^="channels___"] a[href], nav a[href]');
    for (const link of links) {
      let url;
      try { url = new URL(link.getAttribute("href"), "https://discord.com"); } catch { continue; }
      if (url.origin !== "https://discord.com") continue;
      const match = url.pathname.match(/^\/channels\/(\d{15,22})\/(\d{15,22})\/?$/);
      if (!match) continue;
      const key = `${match[1]}/${match[2]}`;
      if (!Object.hasOwn(forums, key)) continue;
      const label = link.querySelector('[class*="name_"], [class*="channelName"]') || link;
      const clone = label.cloneNode(true);
      for (const node of clone.querySelectorAll('svg, button, [role="button"], [aria-hidden="true"], [class*="badge"], [class*="unread"]')) node.remove();
      // Preserve custom emoji labels as well as ordinary Unicode emoji.
      for (const img of clone.querySelectorAll("img[alt]")) img.replaceWith(document.createTextNode(img.getAttribute("alt")));
      const name = clone.textContent.replace(/\s+/g, " ").trim().slice(0, 200);
      if (name) found.set(key, name);
    }
    return [...found].filter(([key, name]) => forums[key].name !== name).map(([key, name]) => ({ key, name }));
  }

  function watch(getForums, submit) {
    let timer = null;
    let busy = false;
    let again = false;
    async function scan() {
      timer = null;
      if (busy) { again = true; return; }
      const names = discover(getForums(), document);
      if (!names.length) return;
      busy = true;
      try { await submit(names); }
      finally {
        busy = false;
        if (again) { again = false; schedule(); }
      }
    }
    function schedule() {
      if (timer === null) timer = setTimeout(scan, 200);
    }
    // Shadow DOM panel changes do not trigger this document observer.
    new MutationObserver(schedule).observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["href", "class", "alt", "data-list-item-id"]
    });
    schedule();
    return schedule;
  }
  globalThis.DiscordForumNames = Object.freeze({ discover, watch });
})();
