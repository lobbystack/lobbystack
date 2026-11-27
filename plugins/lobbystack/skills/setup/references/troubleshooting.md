# Troubleshoot the LobbyStack quickstart

Find the case that matches what you saw, run its checks, and apply its fix. Run Compose commands from the install directory as SKILL.md step 5 describes. Read logs with `docker compose logs --tail 100 <service>`; every case below names the service to read.

Ask the user before anything that deletes data: `docker compose down -v`, `docker volume rm`, or removing the env file. The env file holds the only copy of the database passwords.

## The script stops before starting anything

- **`Docker isn't running` or `can't reach the Docker daemon`**: see SKILL.md step 1.
- **`OpenAI rejected the API key`**: the key is expired, revoked or mistyped. The user creates a new key at https://platform.openai.com/api-keys and either exports `OPENAI_API_KEY` before rerunning or replaces the `OPENAI_API_KEY=` line in the env file. Edit that line with a command that doesn't print the file.
- **`A LobbyStack database already exists ... but <env file> doesn't`**: the Docker volume `lobbystack_postgres_data` survived while its env file was lost or the install moved. Run the script where the old env file is. If it's gone, the data can't be opened: with the user's consent, `docker volume rm lobbystack_postgres_data lobbystack_redis_data lobbystack_storage_data`, then rerun.

## Docker Compose can't start the stack

- **`port is already allocated` or `address already in use`**: another program holds port 3000 or 8025. Rerun with `LOBBYSTACK_PORT=3100` or `LOBBYSTACK_MAIL_PORT=8125`, or stop the other program. `lsof -i :3000` names it on macOS and Linux.
- **`pull access denied`, `manifest unknown` or `denied`**: the images couldn't be pulled. Check the tag in `LOBBYSTACK_VERSION` exists, and that the machine reaches `ghcr.io`.
- **`no matching manifest for linux/...`**: the images exist for `linux/amd64` and `linux/arm64` only.

## The stack starts but isn't ready

- **`The database migration failed`**: read the `migrator` logs. A `password authentication failed for user "postgres"` means the env file and the database volume come from different installs; see the existing-database case above.
- **`admin` or `worker` never turns healthy**: read its logs. A message such as `BETTER_AUTH_SECRET must be at least 32 characters` means the env file was edited by hand: restore the line or delete it and rerun the script, which generates any missing secret. `ECONNREFUSED` to `postgres` or `redis` means that container stopped: check `docker compose ps --all`.
- **The containers are healthy but `curl http://localhost:3000` fails**: something else answers on that port, or a VPN or proxy intercepts `localhost`. Try `LOBBYSTACK_PORT`.

## Sign-up

- **No verification code in Mailpit**: read the `worker` logs for `email.send`. The quickstart sends through Mailpit unless the env file sets `SMTP_HOST`; with a real provider, check its `SMTP_*` values. **Send a new code** on the sign-up page sends another.
- **The page is a 404**: the user opened `127.0.0.1` or a LAN address. Use `http://localhost:<port>`, the address in `APP_BASE_URL`.

## Test call

The browser shows "Something went wrong while starting the call." Find out why:

1. Check the key with OpenAI. This prints only the HTTP status:

   ```bash
   printf 'Authorization: Bearer %s\n' "$(sed -n 's/^OPENAI_API_KEY=//p' .env)" \
     | curl -s -o /dev/null -w '%{http_code}\n' -H @- https://api.openai.com/v1/models
   ```

   Use `.env.quickstart` in a clone. `401` means the user needs a new key; see the rejected-key case above.
2. Read OpenAI's answer. The admin passes OpenAI's error back to the browser without logging it, so ask the user to open the browser's developer tools, select **Network**, start the call again, and read the response of the `session` request. It holds OpenAI's message and code, such as `expired_secret_key` or `insufficient_quota`. A project with no credit, or without access to the GPT-Live realtime models, fails here even when step 1 answers `200`.
3. Check the browser allowed the microphone, in its site settings for `localhost`.
4. When the call starts and then drops, read the `worker` logs. The admin creates the session with OpenAI, then asks the worker to attach at `/internal/live/attach`, and the worker opens its own connection to OpenAI. No public URL or webhook is involved.

## Start over

With the user's consent only: `docker compose down -v` deletes the database, uploads and Redis data. Then delete the env file and rerun the script for a fresh install with new secrets.
