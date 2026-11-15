# TNN media server

Serves segment media folders from Zane's MacBook Pro to the platform. The platform's **Media** tab (on each segment) and public share pages (`/s/<token>`) talk to it.

- **Members** use their normal platform login (the server checks the Supabase session token). They can browse, play, download, upload, make folders and rename. Nothing is ever overwritten: a name clash saves the upload as `name (2).ext`, and renames onto an existing name are refused.
- **Share links** are view/download only and limited to one segment's folder. Anyone signed in can create one from the Media tab and turn it off again.
- Files live in `~/Documents/Zane Server Public/<folder>`. Each segment links to one top-level folder (subfolders are fine). New segments get a folder named after them automatically. The platform's **Media** page browses everything.
- **Smooth previews:** each video gets a 960×540 H.264 copy (~5 Mbps vs ~20 for phone originals) and a small JPEG thumbnail, made in the background with macOS's built-in `avconvert`, `qlmanage` and `sips`. They're cached in `~/Library/Caches/tnn-media/previews`, never in the shared folder, and can be downloaded as "compressed" copies.
- **Rename** is open to members except for top-level folders (execs only; the platform re-links segments). **Delete** is exec-only and moves items into a hidden `.tnn-trash/<date>/` folder in the media root, so anything can be put back by hand.

No npm dependencies; needs Node 20+. It binds to `127.0.0.1` only and is published through a Cloudflare Tunnel as `https://media.bthstnn.org`.

## Settings (environment variables)

| Variable | Example |
|---|---|
| `MEDIA_ROOT` | `/Users/zanewolf/Documents/Zane Server Public` |
| `MEDIA_PUBLIC_URL` | `https://media.bthstnn.org` |
| `MEDIA_ALLOWED_ORIGINS` | `https://platform.bthstnn.org,http://platform.bthstnn.org` |
| `MEDIA_SIGNING_SECRET` | 32+ random characters (`openssl rand -hex 32`) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | same values as the platform's `.env` |
| `MEDIA_HOST`, `MEDIA_PORT` | optional, default `127.0.0.1` and `8090` |
| `MEDIA_CACHE_DIR` | optional, default `~/Library/Caches/tnn-media/previews` |

The platform needs `VITE_MEDIA_API_URL=https://media.bthstnn.org` in its `.env` at build time.

## Setup

1. Run `supabase/add_media.sql` in the Supabase SQL editor.
2. Copy this folder to the Mac and run it as a LaunchAgent (`KeepAlive`, `RunAtLoad`) with the settings above.
3. Publish it with Cloudflare Tunnel: `cloudflared tunnel create tnn-media`, route `media.bthstnn.org` to `http://127.0.0.1:8090`, and run the tunnel as a LaunchAgent too.
4. Rebuild and deploy the platform.

## Uploads

Files go up in 8 MB chunks. A chunk cut off mid-way (phone loses signal, screen locks, tunnel drops) is trimmed back and the browser resumes from the last whole chunk. Each upload's details sit next to its `.part` file in `<MEDIA_ROOT>/.tnn-uploads/`, so uploads also survive a server restart. Leftovers are swept after a day.

## How it runs on the MacBook today

- Code: `~/tnn-media-server` (a copy of this folder). Settings live in the LaunchAgent `~/Library/LaunchAgents/com.tnn.media.plist`; logs go to `~/tnn-media.log`.
- Tunnel: LaunchAgent `com.tnn.cloudflared`, config `~/.cloudflared/config.yml`.
- To deploy changes, from the repo root:
  ```bash
  rsync -a --exclude test --exclude node_modules --exclude ops media-server/ zanewolf@zanes-macbook-pro.local:~/tnn-media-server/
  ssh zanewolf@zanes-macbook-pro.local 'launchctl kickstart -k gui/$(id -u)/com.tnn.media'
  ```
  A restart no longer loses uploads in progress (they resume), but uploads made by the *old* code before this change can't resume.
- `ops/install.sh` describes an older layout (`com.zane.*` agents). Don't run it on the MacBook.

## Tests

```bash
cd media-server && npm test
```
