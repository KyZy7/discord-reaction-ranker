"use strict";
let queue = Promise.resolve();

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab?.url?.startsWith("https://discord.com/")) return false;
  if (request?.type !== "forumNames") return false;
  if (!Array.isArray(request.names) || request.names.length > 1000 || request.names.some(item =>
    !item || typeof item.key !== "string" || !/^\d{15,22}\/\d{15,22}$/.test(item.key)
    || typeof item.name !== "string" || !item.name.trim() || item.name.length > 200)) {
    respond({ error: "Invalid forum names" }); return false;
  }
  const names = request.names.map(item => ({ key: item.key, name: item.name.trim() }));
  // Serialize read/modify/write operations across tabs and survive worker restarts.
  queue = queue.catch(() => {}).then(async () => {
    const { forumNames = {} } = await chrome.storage.local.get("forumNames");
    let changed = false;
    for (const { key, name } of names) {
      if (forumNames[key] !== name) {
        forumNames[key] = name;
        changed = true;
      }
    }
    if (!changed) return;
    await chrome.storage.local.set({ forumNames });
  });
  queue.then(() => respond({ ok: true }), () => respond({ error: "Could not save forum names. Check extension storage." }));
  return true;
});
