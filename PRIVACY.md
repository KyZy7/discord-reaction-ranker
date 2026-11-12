# Privacy policy

Effective November 12, 2026; applies to Discord Reaction Ranker 1.1.0.

## Data handled locally

This unofficial extension ranks observed Discord forum posts. All processing occurs on your device; the maintainer receives none of your Discord data through the extension.

On `https://discord.com`, it observes the URLs and successful response bodies of thread-search and post-data requests Discord already makes. It extracts thread/server/forum IDs, thread titles, author display names, short opening-post text or attachment-filename previews, emoji labels/counts, and observation times. Sidebar labels identify forum names. These include website content, user-generated content, and display names even though processing is local.

Response bodies may contain other message/account fields; they are parsed transiently to extract the limited fields above. Full response bodies are not retained. The extension does not download attachments, inspect unrelated endpoints, read authorization headers/cookies, or request credentials. It makes no additional API calls or automated scrolling.

## Retention and deletion

- **Post data and rankings:** page memory only. Refresh/close discards them. Tabs are independent. Refresh when switching Discord accounts to discard old observations.
- **Forum names:** names and server/forum ID keys remain in extension-local storage until removed. They are shared across tabs in this browser profile; this extension does not synchronize them to a cloud account.
- **Legacy migration:** old persistent ranking caches are deleted at startup and never restored into rankings.

Remove the extension through your browser's extensions page to erase saved forum names; reinstall if desired. Developers may clear its `chrome.storage.local` in extension developer tools. Ordinary browser-cache clearing may not erase extension storage.

## Sharing and permissions

No analytics, ads, telemetry, external servers, remote executable code, data sales, or third-party transfers are implemented. **Open in Discord** navigates to a Discord page; Discord's own policies govern that visit. Your browser and GitHub independently handle extension management and release downloads under their policies.

The `storage` API permission remembers forum names and removes the obsolete ranking cache. Content scripts are restricted to `https://discord.com/*`. No passwords, authentication tokens, unrelated browsing history, or financial information are requested or stored.

## Questions and updates

Use this project's GitHub issue tracker once published. Do not include private captures, credentials, or personal information. Policy changes will appear in this file and release notes.
