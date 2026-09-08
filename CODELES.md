# CodeLES Project Configuration

This directory contains CodeLES configuration for this project.

## Structure
- `.codeles/memory/` - Persistent memory (user, memory, session)
- `.codeles/sessions/` - Chat session history
- `.codeles/cron/` - Scheduled jobs
- `.codeles/skills/` - Custom skills
- `.codeles/logs/` - Log files

## Configuration
- `config.yaml` - Main configuration (managed by `codeles config`)
- `.env` - Environment variables (API keys, etc.)

## Quick Start
```bash
# Start chat
codeles chat

# Check health
codeles doctor

# Configure provider
codeles provider add my-openai -t openai -k sk-... -m gpt-4o

# Add memory
codeles memory add user "Project uses TypeScript strict mode"
```

## Default Provider
CodeLES uses **NVIDIA Nemotron 3 Ultra** by default with **1M token context** - no configuration needed!

Just run `codeles chat` and start coding.
