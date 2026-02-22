# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for testing specifics.

## What Goes Here

- Testing environments
- Browser/device matrix
- Accessibility tools
- Known issues and workarounds

## Examples

```markdown
### Testing Environments

- Local: localhost:3000
- Staging: staging.example.com
- Prod (read-only): app.example.com

### Browser Matrix

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

### Accessibility Tools

- axe DevTools extension
- WAVE extension
- Screen reader: VoiceOver (macOS)

### Known Issues

- [#123] Date picker doesn't announce to screen readers — pending fix
- [#145] Mobile nav has focus trap issue — workaround documented
```

## Common Bug Patterns

Track patterns you see repeatedly:

```markdown
### Recurring Issues

- Form validation messages not announced to screen readers
- Missing alt text on dynamically loaded images
- Color contrast failures on secondary buttons
```

---

Build your testing knowledge base. It makes you better.
