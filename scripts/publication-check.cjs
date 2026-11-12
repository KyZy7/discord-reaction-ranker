// Heuristic leak checks. Report rule names, never credential values.
const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{24,}\b/],
  ['OpenAI-style key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['Discord token', /\b(?:mfa\.[A-Za-z0-9_-]{60,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,})\b/],
  ['Bearer credential', /\bBearer\s+[A-Za-z0-9_.~+\/-]{24,}/i],
  ['copied credential header', /["'](?:authorization|cookie)["']\s*:\s*["'][^"'\r\n]{24,}["']/i],
  ['private Windows path', /\b[A-Z]:[\\/]Users[\\/][A-Za-z0-9_. -]+[\\/]/i]
];
function sensitiveTextRules(text) {
  return rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
function sensitiveFilename(file) {
  const name = file.split(/[\\/]/).at(-1);
  return /^\.env(?:\.|$)/i.test(name) && name !== '.env.example'
    || /\.(?:har|pem|key|pfx|p12|p8|crx)$/i.test(name)
    || /(?:request\.js|response\.json)$/i.test(name)
    || /^(?:credentials(?:\.json)?|id_rsa|id_ed25519)$/i.test(name);
}
module.exports = { sensitiveTextRules, sensitiveFilename };
