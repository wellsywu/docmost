# Docmost Docker Deployment Guide

> Date: 2026-04-14
> Version: 0.71.1

---

## Prerequisites

- Docker & Docker Compose installed
- Git
- At least 2GB RAM for build

---

## 1. Build Custom Image

### 1.1 Clone & Build

```bash
git clone <your-repo-url> docmost
cd docmost
git checkout feat/apiKey

# Build image (tag as you like)
docker build -t docmost-custom:0.71.1 .
```

Build takes ~3-5 min. Multi-stage Dockerfile produces a slim runtime image.

### 1.2 Verify

```bash
docker images | grep docmost
# docmost-custom   0.71.1   ...   ~400MB
```

---

## 2. Local Docker Registry (Optional)

### 2.1 Start Registry

```bash
docker run -d \
  --name registry \
  -p 5000:5000 \
  -v registry_data:/var/lib/registry \
  --restart unless-stopped \
  registry:2
```

### 2.2 Push to Local Registry

```bash
# Tag
docker tag docmost-custom:0.71.1 localhost:5000/docmost-custom:0.71.1
docker tag docmost-custom:0.71.1 localhost:5000/docmost-custom:latest

# Push
docker push localhost:5000/docmost-custom:0.71.1
docker push localhost:5000/docmost-custom:latest
```

### 2.3 Verify

```bash
curl -s http://localhost:5000/v2/_catalog
# {"repositories":["docmost-custom"]}

curl -s http://localhost:5000/v2/docmost-custom/tags/list
# {"name":"docmost-custom","tags":["0.71.1","latest"]}
```

### 2.4 Remote Server Pull (insecure registry)

On the target server, add to `/etc/docker/daemon.json`:

```json
{
  "insecure-registries": ["YOUR_REGISTRY_HOST:5000"]
}
```

```bash
sudo systemctl restart docker
docker pull YOUR_REGISTRY_HOST:5000/docmost-custom:latest
```

---

## 3. Deploy

### 3.1 Prepare docker-compose.yml

Copy `docker-compose.yml` and modify the image line:

```yaml
services:
  docmost:
    image: docmost-custom:0.71.1    # local build
    # image: localhost:5000/docmost-custom:latest  # or from local registry
    depends_on:
      - db
      - redis
    environment:
      APP_URL: 'http://YOUR_HOST:3000'
      APP_SECRET: '<generate-a-long-random-string>'
      DATABASE_URL: 'postgresql://docmost:STRONG_DB_PASSWORD@db:5432/docmost'
      REDIS_URL: 'redis://redis:6379'
    ports:
      - "3000:3000"
    restart: unless-stopped
    volumes:
      - docmost:/app/data/storage

  db:
    image: postgres:18
    environment:
      POSTGRES_DB: docmost
      POSTGRES_USER: docmost
      POSTGRES_PASSWORD: STRONG_DB_PASSWORD
    restart: unless-stopped
    volumes:
      - db_data:/var/lib/postgresql/data

  redis:
    image: redis:8
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  docmost:
  db_data:
  redis_data:
```

### 3.2 Generate APP_SECRET

```bash
openssl rand -hex 32
```

### 3.3 Start

```bash
docker compose up -d
```

### 3.4 Check Status

```bash
docker compose ps
docker compose logs -f docmost
```

Visit `http://YOUR_HOST:3000` to complete the initial setup.

---

## 4. Common Operations

### Update Image

```bash
# Rebuild after code change
docker build -t docmost-custom:0.71.1 .

# Restart with new image
docker compose down
docker compose up -d
```

### Backup Database

```bash
docker compose exec db pg_dump -U docmost docmost > backup_$(date +%Y%m%d).sql
```

### Restore Database

```bash
cat backup_20260414.sql | docker compose exec -T db psql -U docmost docmost
```

### View Logs

```bash
docker compose logs -f --tail=100 docmost
```

---

## 5. Production Checklist

- [ ] Change `APP_SECRET` to a strong random value
- [ ] Change database password from default
- [ ] Set `APP_URL` to your actual domain
- [ ] Configure reverse proxy (Nginx/Caddy) with HTTPS
- [ ] Set up database backup cron job
- [ ] Configure firewall (only expose 80/443)

---

## 6. Known Issues

### ⚠️ Login redirect failure when HTTP/HTTPS protocol mismatch

**Symptom**: After login, the page stays on the login screen without error.

**Cause**: The `authToken` cookie is set with the `Secure` flag when `APP_URL` uses `https://`.
Browsers **will not send `Secure` cookies over HTTP connections**, causing subsequent requests to `/users/me` to return `401`, which traps the user on the login page.

**Rule**: `APP_URL` protocol **must match** how users access the application.

| `APP_URL` | User Access | Result |
|---|---|---|
| `https://your-domain.com` | HTTPS | ✅ Works |
| `https://your-domain.com` | HTTP | ❌ Login loops |
| `http://your-server:3000` | HTTP | ✅ Works (insecure) |

**Fix**: Always redirect HTTP → HTTPS via Nginx, or ensure `APP_URL` matches actual access protocol.

> See full SOP: [docs/sop-login-redirect-issue.md](./sop-login-redirect-issue.md)
