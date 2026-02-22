# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for infrastructure specifics.

## What Goes Here

- Environment URLs and access
- CI/CD pipeline details
- Monitoring and alerting endpoints
- Runbooks for common operations

## Environments

```markdown
### Development

- URL: localhost / dev.example.com
- Purpose: Local development, feature testing
- Deploy: Automatic on push to feature branches

### Staging

- URL: staging.example.com
- Purpose: Pre-production testing, QA
- Deploy: Automatic on merge to main
- Data: Sanitized copy of production

### Production

- URL: app.example.com
- Purpose: Live user traffic
- Deploy: Manual approval required
- Rollback: Previous 3 versions available
```

## CI/CD Pipelines

```markdown
### Build Pipeline

- Trigger: Push to any branch
- Steps: Lint → Test → Build → Security scan
- Duration: ~5 minutes

### Deploy Pipeline

- Trigger: Manual or merge to main
- Steps: Build → Deploy staging → Smoke tests → (Manual gate) → Deploy prod
- Rollback: `./scripts/rollback.sh <version>`
```

## Monitoring

```markdown
### Dashboards

- Infrastructure: grafana.example.com
- Application: app-metrics.example.com
- Logs: logs.example.com

### Alerts

- PagerDuty for critical (P1)
- Slack #alerts for warnings (P2-P3)
- Email digest for informational
```

## Runbooks

```markdown
### Deploy to Production

1. Ensure staging is green
2. Run `./scripts/deploy-prod.sh`
3. Monitor dashboards for 15 minutes
4. If issues: `./scripts/rollback.sh`

### Scale Up

1. Check current capacity: `kubectl get pods`
2. Increase replicas: `kubectl scale --replicas=N`
3. Verify health: `kubectl get pods -w`

### Incident Response

1. Acknowledge in PagerDuty
2. Check dashboards for impact
3. Identify cause in logs
4. Mitigate or rollback
5. Post-incident: update runbook
```

---

Keep this updated. When 3 AM incidents happen, this is your lifeline.
