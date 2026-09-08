# CodeLES - AI Coding Agent

<div align="center">
  <img src="https://raw.githubusercontent.com/luislutchii/codeles/main/docs/logo-codeles.jpg" alt="CodeLES Logo" width="120" height="120" style="border-radius: 16px;">
  
  <h1>CodeLES</h1>
  <p><strong>AI Coding Agent com 1M tokens de contexto via NVIDIA Nemotron 3 Ultra</strong></p>
  <p>Zero configuração · Multi-provider · Ferramentas built-in · Memória persistente · Delegação paralela</p>
  
  <p>
    <a href="https://github.com/luislutchii/codeles"><img src="https://img.shields.io/github/stars/luislutchii/codeles?style=social" alt="GitHub Stars"></a>
    <a href="https://github.com/luislutchii/codeles"><img src="https://img.shields.io/github/forks/luislutchii/codeles?style=social" alt="GitHub Forks"></a>
    <a href="https://github.com/luislutchii/codeles/issues"><img src="https://img.shields.io/github/issues/luislutchii/codeles" alt="GitHub Issues"></a>
    <a href="https://github.com/luislutchii/codeles/blob/main/LICENSE"><img src="https://img.shields.io/github/license/luislutchii/codeles" alt="License"></a>
    <a href="https://twitter.com/les_systems"><img src="https://img.shields.io/twitter/follow/les_systems?style=social" alt="Twitter Follow"></a>
    <a href="https://instagram.com/les.systems"><img src="https://img.shields.io/badge/Instagram-%40les.systems-E4405F?logo=instagram&logoColor=white" alt="Instagram"></a>
  </p>
</div>

---

## 🚀 Características Principais

- **🧠 1M Contexto por Padrão** - NVIDIA Nemotron 3 Ultra integrado (sem configuração)
- **🔌 Multi-Provider** - OpenAI, Anthropic, OpenRouter, Google, Cohere, Mistral, Groq, Together, Custom
- **🛠️ Ferramentas Built-in** - Terminal, Filesystem, Web Search, Delegation
- **🧩 Sistema de Skills** - Plugins extensíveis para workflows personalizados
- **💾 Memória Persistente** - User memory, project memory, session memory
- **👥 Delegação de Tarefas** - Subagentes paralelos (leaf + orchestrator)
- **⏰ Cron Jobs** - Tarefas agendadas com linguagem natural
- **🎨 TUI Rica** - Interface terminal com Ink (React para CLI)
- **🔒 Segurança First** - Configuração via .env, .gitignore protegido
- **📦 Monorepo TypeScript** - Packages: core, providers, tools, cli

## 📦 Instalação Rápida

```bash
# Clone o repositório
git clone https://github.com/luislutchii/codeles.git
cd codeles

# Instale dependências
npm run install:all

# Configure variáveis de ambiente (opcional - NVIDIA funciona out-of-the-box)
cp .env.example .env
# Edite .env com suas chaves se quiser outros providers

# Inicialize no seu projeto
codeles init

# Comece a codificar!
codeles chat
```

## ⚙️ Configuração

### Provider Padrão: NVIDIA Nemotron 3 Ultra (1M Context)

O CodeLES vem configurado com **NVIDIA Nemotron 3 Ultra** como provider padrão - **zero configuração necessária**. Basta rodar `codeles chat` e começar.

Para usar sua própria chave NVIDIA (maiores limites):
```bash
# No .env
NVIDIA_API_KEY=nvapi-sua-chave-aqui
```

### Adicionar Outros Providers

```bash
# OpenAI
codeles provider add meu-openai -t openai -k sk-... -m gpt-4o

# Anthropic
codeles provider add meu-claude -t anthropic -k sk-ant-... -m claude-3-5-sonnet

# OpenRouter (100+ modelos)
codeles provider add openrouter -t openrouter -k sk-or-... -m anthropic/claude-3.5-sonnet

# Google Gemini
codeles provider add gemini -t google -k ... -m gemini-1.5-pro

# Groq (ultra-rápido)
codeles provider add groq -t groq -k gsk_... -m llama-3.1-70b-versatile

# Custom (OpenAI-compatible)
codeles provider add minha-api -t custom -k ... -u https://api.exemplo.com/v1 -m meu-modelo
```

### Trocar Provider/Modelo na Hora

```bash
# Via chat (comandos internos)
/provider    # Lista e troca provider
/model       # Lista e troca modelo

# Via CLI
codeles chat --provider openrouter --model anthropic/claude-3.5-sonnet
```

## 🎯 Comandos Principais

| Comando | Descrição |
|---------|-----------|
| `codeles chat` | Sessão interativa de chat |
| `codeles init` | Inicializa CodeLES no projeto atual |
| `codeles doctor` | Verifica saúde do sistema |
| `codeles config show` | Mostra configuração atual |
| `codeles config set <key> <value>` | Define configuração |
| `codeles provider list` | Lista providers configurados |
| `codeles provider add <name>` | Adiciona novo provider |
| `codeles provider test <name>` | Testa conexão do provider |
| `codeles tools list` | Lista ferramentas disponíveis |
| `codeles tools enable|disable <name>` | Habilita/desabilita ferramenta |
| `codeles memory add user|memory <content>` | Adiciona à memória |
| `codeles memory search user|memory <query>` | Busca na memória |
| `codeles session list` | Lista sessões salvas |
| `codeles delegate spawn <goal>` | Cria subagente para tarefa |
| `codeles cron create <name> <schedule> <prompt>` | Cria job agendado |

## 🧠 Memória Inteligente

O CodeLES mantém três tipos de memória:

- **User Memory** - Preferências globais do usuário (persiste entre projetos)
- **Project Memory** - Conhecimento específico do projeto (arquitetura, decisões, padrões)
- **Session Memory** - Contexto da conversa atual

```bash
# Adicionar preferência do usuário
codeles memory add user "Prefiro TypeScript strict mode com ESLint Airbnb"

# Adicionar conhecimento do projeto
codeles memory add memory "Auth usa JWT com refresh tokens, rota /auth/refresh"

# Buscar
codeles memory search memory "JWT"
```

## 🤖 Delegação de Tarefas

Crie subagentes paralelos para tarefas complexas:

```bash
# Subagente único
codeles delegate spawn "Refatorar módulo de autenticação para usar Passport.js" -c "Manter compatibilidade com JWT atual"

# Múltiplos subagentes (batch)
codeles delegate batch --file tasks.json
```

## ⏰ Cron Jobs com Linguagem Natural

```bash
# Backup diário às 2h
codeles cron create daily-backup "0 2 * * *" "Fazer backup do banco e arquivos importantes"

# Code review semanal
codeles cron create weekly-review "0 9 * * 1" "Revisar PRs abertos e sugerir melhorias"

# Executar manualmente
codeles cron run <job-id>
```

## 🏗️ Arquitetura do Monorepo

```
codeles/
├── packages/
│   ├── core/           # Config, types, memory, session, delegation
│   ├── providers/      # Adapters: OpenAI, Anthropic, NVIDIA, etc.
│   ├── tools/          # Terminal, Filesystem, Web, Delegation
│   └── cli/            # Ink TUI, commands, entry point
├── .env.example        # Template de variáveis de ambiente
├── .gitignore          # Protege secrets
└── tsconfig.json       # Config TypeScript base
```

## 🔧 Desenvolvimento

```bash
# Modo desenvolvimento (watch)
npm run dev

# Build completo
npm run build

# Testes
npm run test

# Lint
npm run lint

# Limpar tudo
npm run clean
```

## 📁 Estrutura de Configuração

```
~/.codeles/profiles/default/
├── config.yaml         # Configuração principal
├── memory/
│   ├── user.json       # Memória do usuário
│   ├── memory.json     # Memória do projeto
│   └── session.json    # Memória da sessão
├── sessions/           # Histórico de chats
├── cron/               # Jobs agendados
└── skills/             # Skills carregadas
```

## 🌐 Links Oficiais

- **Site Oficial:** https://lutchi.vercel.app
- **Landing Page:** https://codeles-landing.vercel.app
- **GitHub:** https://github.com/luislutchii/codeles
- **Instagram:** https://instagram.com/les.systems
- **Fundador:** Luís Lutchi (@luislutchii)
- **Empresa:** Lutchi Enterprise Systems (LES)

---

<div align="center">
  <p><strong>CodeLES</strong> - <em>Profissional. Prestativo. Inteligente. Estratégico. Amigável.</em></p>
  <p>Desenvolvido com ❤️ por <a href="https://lutchi.vercel.app">Lutchi Enterprise Systems</a></p>
</div>