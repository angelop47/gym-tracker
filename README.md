# Gym tracker

Home workout tracker: weekly routine plan, guided workout sessions with a rest timer, and a full set history.
Astro (SSR) + React islands + SQLite (`node:sqlite`, no native dependencies).

## Develop

```sh
npm install
npm run dev      # http://localhost:4321, DB at ./data/gym.db
npm test
```

## Deploy (Docker / Proxmox)

```sh
docker build -t gym .
docker run -d --name gym --restart unless-stopped -p 4321:4321 -v gym-data:/data gym
```

- The SQLite file lives in the `/data` volume (`DB_PATH=/data/gym.db`). Back that volume up.
- `TZ` (default `Europe/Madrid`) decides which weekday is "today": `-e TZ=...` to change it.
- The app is plain HTTP. Browsers only allow the Screen Wake Lock API on HTTPS, so put a reverse proxy
  with TLS in front if you want the screen to stay on during rests.

## Exercise photos

Photos live **inside the SQLite database** (table `exercise_photos`), so backing up `gym.db` (the `/data` volume)
backs up every photo. From **Rutinas → Ejercicios y fotos** you can add up to 4 photos per exercise (JPG, PNG, WebP or
GIF, up to 5 MB) and delete any of them. They are shrunk to 1280 px in the browser before uploading, and the server
checks the real content of every upload (it does not trust the declared type), so SVG/HTML files are rejected.

A new, empty database has **no photos**: to move your data to another machine, copy `gym.db`.

The initial photos (30 exercises, 2 each) were imported once from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense, public domain). Some are the closest
available movement (for example, ring rows use a suspension-strap row). Databases created by earlier versions keep a
now-unused `exercises.image` column with the free-exercise-db folder each photo came from.
