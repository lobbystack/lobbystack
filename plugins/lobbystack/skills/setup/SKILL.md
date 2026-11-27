---
name: setup
description: Installs, starts, checks and troubleshoots a self-hosted LobbyStack (open-source AI receptionist) on this machine with Docker and an OpenAI API key. Use when the user asks to set up, install, run, try, update or fix LobbyStack locally, or to add a phone number to a self-hosted LobbyStack.
---

# Set up LobbyStack

LobbyStack's quickstart runs the whole stack from prebuilt images with Docker Compose: PostgreSQL, Redis, Mailpit, a migrator, the dashboard (`admin`) and the `worker`. It needs Docker and an OpenAI API key, and nothing else. The dashboard ends up at `http://localhost:3000`, where the user signs up and hears their agent in a browser test call.

`scripts/quickstart.sh` does the work. Your job is to get the machine ready, run it, prove the stack is healthy, and hand the browser part to the user.

The OpenAI API key is a secret. Keep it out of the conversation: never print it, echo it, or ask the user to paste it into chat. If they paste it anyway, write it to the env file with a command that doesn't print it, and don't repeat it.

## 1. Check the machine

Run `uname -s` (and `grep -i microsoft /proc/version` on Linux, to spot WSL), `docker info` and `docker compose version`.

- macOS: Docker Desktop, or OrbStack or Colima with the Compose plugin.
- Linux: Docker Engine with the `docker-compose-plugin` package. A `permission denied` from `docker info` means the user isn't in the `docker` group: they run `sudo usermod -aG docker "$USER"` and log in again.
- Windows: WSL 2 with Docker Desktop's WSL integration turned on, and every command runs inside the WSL terminal. Git Bash, Cygwin and PowerShell aren't supported.

Done when `docker info` succeeds and `docker compose version` reports v2 or later. If Docker is missing or stopped, tell the user what to install or start for their OS and wait for them.

## 2. Find an existing install

Look for one before you make a new one:

- a `lobbystack/` directory with `.env` and `docker-compose.quickstart.yml`, from the one-line install, usually in the user's home or the directory they name;
- a clone of `lobbystack/lobbystack` with `.env.quickstart` at its root;
- running containers: `docker ps --filter label=com.docker.compose.project=lobbystack`.

Rerunning the script on an existing install is safe: it keeps the secrets, the database and the saved key, pulls newer images and restarts what changed. That is also how the user updates.

## 3. Get the key to the script

The script reads `OPENAI_API_KEY` from its environment, then from the install's env file, and only asks in a terminal as a last resort. You have no terminal for that prompt, so pick one:

- `OPENAI_API_KEY` is already set in your shell (check with `[ -n "$OPENAI_API_KEY" ] && echo set`): run the script yourself.
- The install already has a key saved (`grep -c '^OPENAI_API_KEY=.' lobbystack/.env`): run the script yourself.
- Neither: ask the user to run the install command from step 4 in their own terminal, where the script asks for the key with hidden input, and to tell you when it finishes. Then continue at step 5.

## 4. Run the quickstart

From the directory that should contain `lobbystack/`:

```bash
curl -fsSL https://raw.githubusercontent.com/lobbystack/lobbystack/main/scripts/quickstart.sh | bash
```

From a clone of the repository, run `./scripts/quickstart.sh` at its root instead.

The first run downloads about 600 MB of images, so give the command a timeout of 15 minutes or run it in the background. The script checks the key with OpenAI before it starts anything and stops with a clear message if OpenAI rejects it.

Settings go in the environment of the script, and the script saves them in the env file for later runs:

| Variable | Use |
| --- | --- |
| `LOBBYSTACK_PORT`, `LOBBYSTACK_MAIL_PORT` | Dashboard and Mailpit ports on 127.0.0.1, when 3000 or 8025 is taken. |
| `LOBBYSTACK_VERSION` | An image tag, such as `1.2.0`, instead of `latest`. |
| `LOBBYSTACK_DIR` | Where the one-line install creates its directory. |

Done when the script prints `LobbyStack is running at http://localhost:<port>`.

## 5. Prove it's healthy

Run Compose commands from the install directory: plain `docker compose` in `lobbystack/`, or `docker compose -p lobbystack -f docker-compose.quickstart.yml --env-file .env.quickstart` in a clone.

- `curl -fsS http://localhost:3000/api/health/ready` returns `"ok":true` with `database`, `redis` and `storage` all `ok`.
- `docker compose ps` shows `admin` and `worker` as `healthy`, and `migrator` exited with code 0.

Done when both hold. If either fails, or the script stopped with an error, read [references/troubleshooting.md](references/troubleshooting.md) and work through the matching case.

## 6. Hand over to the user

The rest happens in their browser. Tell them:

1. Open `http://localhost:3000` and create an account. The dashboard answers only on `localhost`: `http://127.0.0.1:3000` shows a 404.
2. The verification code arrives in Mailpit at `http://localhost:8025`, which catches every email the stack sends.
3. On **Make this app your own**, set an app name and logo or select **Skip and keep LobbyStack**. Name the business, select **I don't have a website**, keep the language, select **I'll add a number later**, and pick any answer to **How did you hear about LobbyStack?**
4. On **Meet your agent**, select **Start test call** and allow the microphone. Later, **Hear your agent** on the dashboard home starts the same call.

If the call doesn't start, go to the "Test call" case in [references/troubleshooting.md](references/troubleshooting.md).

## Phone numbers

The quickstart answers browser calls only. Phone calls need a public HTTPS address and a carrier, Twilio or Telnyx. When the user asks for a phone number, follow [references/phone-numbers.md](references/phone-numbers.md).
