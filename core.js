(function (root) {
  "use strict";
  const isId = value => typeof value === "string" && /^\d{15,22}$/.test(value);
  const text = (value, limit = 200) => typeof value === "string" ? value.slice(0, limit) : "";
  const validTime = value => Number.isSafeInteger(value) && value > 0;

  function endpoint(value) {
    try {
      const url = new URL(value, "https://discord.com");
      if (url.origin !== "https://discord.com") return null;
      const match = url.pathname.match(/^\/api\/v\d+\/channels\/(\d{15,22})\/(threads\/search|post-data)\/?$/);
      return match ? { forumId: match[1], kind: match[2] } : null;
    } catch { return null; }
  }

  function opening(message, observedAt) {
    if (!message || typeof message !== "object") return null;
    const reactions = (Array.isArray(message.reactions) ? message.reactions : []).slice(0, 200).map(r => ({
      emoji: text(r?.emoji?.name, 100) || text(r?.emoji?.id, 30) || "Emoji",
      count: Number.isSafeInteger(r?.count) && r.count >= 0 ? r.count : 0
    }));
    const attachment = Array.isArray(message.attachments) ? message.attachments[0] : null;
    return {
      author: text(message.author?.global_name || message.author?.username),
      preview: text(message.content, 300) || text(attachment?.filename, 300),
      reactions,
      total: reactions.reduce((sum, reaction) => sum + reaction.count, 0),
      observedAt
    };
  }

  function normalize(data, source, guildId, observedAt = Date.now()) {
    if (!data || !source || !isId(source.forumId)) return [];
    const groups = new Map();
    function group(server) {
      if (!isId(server)) return null;
      if (!groups.has(server)) groups.set(server, {
        guildId: server, forumId: source.forumId, threads: [], observedAt
      });
      return groups.get(server);
    }
    if (source.kind === "threads/search" && Array.isArray(data.threads)) {
      const messages = new Map((Array.isArray(data.first_messages) ? data.first_messages : [])
        .filter(m => isId(m?.channel_id) && m.id === m.channel_id).map(m => [m.channel_id, m]));
      for (const t of data.threads) {
        if (!isId(t?.id) || (t.parent_id && t.parent_id !== source.forumId)) continue;
        const target = group(t.guild_id || guildId);
        if (!target) continue;
        target.threads.push({ id: t.id, title: text(t.name), message: opening(messages.get(t.id), observedAt) });
        if (Number.isSafeInteger(data.total_results) && data.total_results >= 0) {
          target.searchTotal = data.total_results;
        }
      }
    } else if (source.kind === "post-data" && data.threads && !Array.isArray(data.threads)) {
      const target = group(guildId);
      if (!target) return [];
      for (const [id, entry] of Object.entries(data.threads)) {
        if (!isId(id)) continue;
        const m = entry?.first_message;
        target.threads.push({ id, title: "", message: m?.id === id && m.channel_id === id ? opening(m, observedAt) : null });
      }
    }
    return [...groups.values()];
  }

  // Validate the page-to-extension boundary and reconstruct only allowed fields.
  function validate(batch) {
    if (!batch || !isId(batch.guildId) || !isId(batch.forumId) || !validTime(batch.observedAt)
      || !Array.isArray(batch.threads) || batch.threads.length > 1000) return null;
    const result = { guildId: batch.guildId, forumId: batch.forumId, observedAt: batch.observedAt, threads: [] };
    if (Number.isSafeInteger(batch.searchTotal) && batch.searchTotal >= 0) result.searchTotal = batch.searchTotal;
    for (const thread of batch.threads) {
      if (!isId(thread?.id)) return null;
      let message = null;
      if (thread.message !== null) {
        const m = thread.message;
        if (!m || !validTime(m.observedAt) || !Array.isArray(m.reactions) || m.reactions.length > 200) return null;
        const reactions = [];
        for (const r of m.reactions) {
          if (typeof r?.emoji !== "string" || !Number.isSafeInteger(r.count) || r.count < 0) return null;
          reactions.push({ emoji: text(r.emoji, 100), count: r.count });
        }
        const total = reactions.reduce((sum, r) => sum + r.count, 0);
        if (!Number.isSafeInteger(total)) return null;
        message = { author: text(m.author), preview: text(m.preview, 300), reactions, total, observedAt: m.observedAt };
      }
      result.threads.push({ id: thread.id, title: text(thread.title), message });
    }
    return result;
  }

  function merge(state, batch) {
    const key = `${batch.guildId}/${batch.forumId}`;
    const forum = state.forums[key] ||= {
      guildId: batch.guildId, forumId: batch.forumId, threads: {}, observedAt: 0
    };
    if (batch.observedAt >= forum.observedAt) {
      forum.observedAt = batch.observedAt;
      if (batch.searchTotal !== undefined) forum.searchTotal = batch.searchTotal;
    }
    for (const incoming of batch.threads) {
      const previous = forum.threads[incoming.id] ||= { id: incoming.id, title: "", titleAt: 0, message: null };
      if (incoming.title && batch.observedAt >= previous.titleAt) {
        previous.title = incoming.title;
        previous.titleAt = batch.observedAt;
      }
      if (incoming.message && (!previous.message || incoming.message.observedAt >= previous.message.observedAt)) {
        previous.message = incoming.message;
      }
    }
    return state;
  }

  function ranked(forum) {
    return Object.values(forum?.threads || {}).sort((a, b) => {
      if (Boolean(a.message) !== Boolean(b.message)) return a.message ? -1 : 1;
      const diff = (b.message?.total ?? 0) - (a.message?.total ?? 0);
      return diff || a.id.localeCompare(b.id);
    });
  }

  root.DiscordReactionCore = Object.freeze({ endpoint, normalize, validate, merge, ranked });
})(globalThis);
