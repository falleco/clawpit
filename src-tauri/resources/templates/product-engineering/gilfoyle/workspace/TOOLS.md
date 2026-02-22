# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for environment specifics.

## What Goes Here

- Database connection references (not credentials)
- Server hostnames and roles
- Development environment setup
- CI/CD pipeline details
- Monitoring endpoints

## Examples

```markdown
### Development

- Local DB: PostgreSQL 15 on localhost:5432
- Redis: localhost:6379
- Docker network: openclaw-network

### Staging

- API: staging-api.example.com
- DB: staging-db (read replica available)

### Monitoring

- Logs: /var/log/openclaw/
- Metrics: Grafana at monitoring.example.com
```

## Security Notes

**Never store credentials here.** Reference them by name or environment variable.

```markdown
# BAD
DB_PASSWORD=supersecret123

# GOOD
DB credentials: stored in .env, rotated monthly
```

---

Add what helps you work. Keep secrets out.
