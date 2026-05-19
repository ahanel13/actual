This is the main project to run [Actual](https://github.com/actualbudget/actual), a local-first personal finance tool. It comes with the latest version of Actual, and a server to persist changes and make data available across all devices.

### Getting Started

Actual is a local-first personal finance tool. It is 100% free and open-source, written in NodeJS, it has a synchronization element so that all your changes can move between devices without any heavy lifting.

If you are interested in contributing, or want to know how development works, see our [contributing](https://actualbudget.org/docs/contributing/) document we would love to have you.

Want to say thanks? Click the ⭐ at the top of the page.

### Using the CLI tool

Node.js v22 or higher is required for the @actual-app/sync-server npm package

**Install globally with npm:**

```bash
npm install --location=global @actual-app/sync-server
```

After installing, you can execute actual-server commands directly in your terminal.

**Usage**

```bash
actual-server [options]
```

**Available options**

| Command             | Description                  |
| ------------------- | ---------------------------- |
| `-h` or `--help`    | Print this list and exit.    |
| `-v` or `--version` | Print this version and exit. |
| `--config`          | Path to the config file.     |
| `--reset-password`  | Reset your password          |

**Examples**

Run with default configuration

```bash
actual-server
```

Run with custom configuration

```bash
actual-server --config ./config.json
```

Reset your password

```bash
actual-server --reset-password
```

### Plaid integration (fork-specific)

This fork adds a Plaid bank-sync provider. Plaid credentials and per-Item access tokens are stored **encrypted at rest** in the sync-server's account DB using AES-256-GCM. The encryption key is a server-side env var.

**Setup**

1. **Generate a master encryption key** (32 bytes, base64-encoded):

   ```bash
   openssl rand -base64 32
   ```

2. **Configure the key** via the `ACTUAL_ENCRYPTION_KEY` env var (e.g. systemd unit override):

   ```ini
   [Service]
   Environment=ACTUAL_ENCRYPTION_KEY=<paste-base64-key-here>
   ```

   Then `systemctl daemon-reload && systemctl restart actual-server`.

   **Back this key up.** Losing it makes every stored Plaid Item unrecoverable — you'd have to re-link from scratch.

3. **Get Plaid production credentials**:
   - Sign up at https://dashboard.plaid.com
   - Complete the Plaid Production Agreement (required for real bank linking; sandbox/dev creds also work but are limited)
   - Grab your `PLAID_CLIENT_ID` and `PLAID_SECRET` from the dashboard

4. **Configure inside Actual**: Settings → Bank Sync → Plaid → "Set up Plaid" → paste the client ID and secret. These are encrypted at rest before being written to SQLite.

5. **Link a bank**: Settings → Bank Sync → Plaid → "Link a new bank" opens Plaid Link. After completing the bank login, choose which accounts to import. Initial transactions sync immediately.

**Cost**

Plaid bills ~$0.20–0.30 per linked Item per month in production. Closing the last Actual account linked to an Item releases it upstream (via `/item/remove`) so you stop being billed.

**Background sync**

By default the sync-server polls Plaid `/transactions/sync` for every linked Item every 6 hours. Configure with `ACTUAL_PLAID_SYNC_INTERVAL_HOURS` (set to `0` to disable scheduled sync — user-initiated only).

**Security model**

- Plaid creds and per-Item access tokens are encrypted at rest with AES-256-GCM (the `v1:iv:tag:ct` format). Server logs never include plaintext.
- Threat model addressed: disk theft, DB backup leak, sync-server filesystem compromise.
- Not addressed (by design): in-memory exposure on a compromised running server, local-client-disk plaintext for transaction data.
- COOP/COEP intentionally **not** set on the main app so Plaid's iframe widget can load. `SharedArrayBuffer` is unavailable; absurd-sql uses its non-SAB fallback path (auto-enabled in `browser-preload.js`).

### Documentation

We have a wide range of documentation on how to use Actual. This is all available in our [Community Documentation](https://actualbudget.org/docs/), including topics on [installing](https://actualbudget.org/docs/install/), [Budgeting](https://actualbudget.org/docs/budgeting/), [Account Management](https://actualbudget.org/docs/accounts/), [Tips & Tricks](https://actualbudget.org/docs/getting-started/tips-tricks) and some documentation for developers.

### Feature Requests

Current feature requests can be seen [here](https://github.com/actualbudget/actual/issues?q=is%3Aissue+label%3A%22needs+votes%22+sort%3Areactions-%2B1-desc). Vote for your favorite requests by reacting 👍 to the top comment of the request.

To add new feature requests, open a new Issue of the "Feature Request" type.
