// Entirely invented data. No real servers, accounts, messages, or attachments.
const guildId = '800000000000000001';
const forumId = '800000000000000002';
const otherForumId = '800000000000000003';
const titles = ['Community garden mod', 'Night sky texture pack', 'Accessible color theme', 'Compact scoreboard mod', 'Mountain trail scenery', 'Classic uniform collection', 'Soft stadium lighting', 'Minimal menu mod'];
function message(id, index, total) {
  const normal = Math.floor(total * 0.7);
  return {
    id, channel_id: id, type: 0,
    content: `Demo project ${index + 1}: an imaginary community project used to demonstrate local reaction rankings. No real user content is included.`,
    author: { id: String(820000000000000000n + BigInt(index)), username: `demo_builder_${index + 1}`, global_name: `Demo Builder ${index + 1}` },
    attachments: [], timestamp: '2026-01-01T12:00:00.000Z',
    reactions: [
      { emoji: { id: null, name: '⭐' }, count: normal, count_details: { normal, burst: 0 } },
      { emoji: { id: null, name: '🔥' }, count: total - normal, count_details: { normal: total - normal, burst: 0 } }
    ]
  };
}
const search = { threads: [], members: [], first_messages: [], total_results: 188, has_more: true };
for (let i = 0; i < 25; i++) {
  const id = String(810000000000000000n + BigInt(i));
  search.threads.push({ id, guild_id: guildId, parent_id: forumId, type: 11, name: `${titles[i % titles.length]} ${Math.floor(i / titles.length) + 1}` });
  if (i < 22) search.first_messages.push(message(id, i, 420 - i * 11));
}
const post = { threads: {} };
const totals = [232, 113, 76, 290, 155, 264, null, 159, 42, 79];
for (let i = 0; i < totals.length; i++) {
  const id = String(830000000000000000n + BigInt(i));
  post.threads[id] = { first_message: totals[i] === null ? null : message(id, i + 25, totals[i]), owner: null };
}
module.exports = { guildId, forumId, otherForumId, search, post };
