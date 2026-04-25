# Server Legends

A Discord collectible card bot for server members. Players open packs, collect member cards, trade with each other, sell cards on the market, and climb leaderboards.

## Requirements

- Node.js 20+
- PostgreSQL 16+ or Docker with Docker Compose
- A Discord application with a bot user and slash commands enabled

## Configuration

Create a `.env` file in the project root:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_discord_application_id
GUILD_ID=your_test_server_id
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/server_legends
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=server_legends
NODE_ENV=production
```

`GUILD_ID` is used to register guild slash commands, so it is best to deploy and test the bot on one server first.

For SSH-based production deploys, also add your server settings:

```env
DEPLOY_HOST=user@your-server
DEPLOY_REMOTE_DIR=/home/ubuntu/serverlegends-deploy
DEPLOY_DATABASE_URL=postgresql://serverlegends:your_password@postgres.postgres.svc.cluster.local:5432/serverlegends
K8S_NAMESPACE=serverlegends
K8S_SECRET_NAME=serverlegends-secret
K8S_DEPLOYMENT_NAME=serverlegends-bot
K8S_APP_LABEL=serverlegends-bot
DOCKER_IMAGE=serverlegends-bot:latest
```

`DEPLOY_HOST` can be an alias from `~/.ssh/config` or a full `user@host` address.
`DEPLOY_DATABASE_URL` is required for production deploys and is written directly to the Kubernetes secret. Do not reuse a local `localhost` database URL for Kubernetes.

### Production / Kubernetes

In production, `DATABASE_URL` should not point to `localhost`. Use your PostgreSQL service address instead, for example:

```env
DATABASE_URL=postgresql://serverlegends:your_password@postgres.postgres.svc.cluster.local:5432/serverlegends
NODE_ENV=production
```

## Running The Bot

### Option 1: Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL and load the schema from `src/db/schema.sql`.

3. Register Discord slash commands:

```bash
npm run deploy
```

4. Start the bot:

```bash
npm start
```

### Option 2: Docker Compose Database

The project includes a `docker-compose.yml` for PostgreSQL:

```bash
docker compose up -d postgres
```

The schema from `src/db/schema.sql` is loaded automatically.

## Usage

### First Server Setup

1. An administrator runs `/setup`.
2. They set `channel`, `interval`, `packs`, and optionally `excluded_role`.
3. After saving the configuration, players can use `/open`.

### Player Commands

- `/help` - shows a short in-Discord guide
- `/open [pack] [amount]` - opens the selected pack; up to 5 packs use a card slider, while 6-50 packs use a bulk summary
- `/odds [pack]` - shows drop odds for every tier in the selected pack
- `/shop view` - shows all available packs and prices
- `/shop buy pack:<type> amount:<number>` - buys packs with coins
- `/inventory [page]` - shows your cards
- `/cards id:<id>` - generates an image for a selected inventory card
- `/balance` - shows your coins, packs, and time until the next free pack
- `/sell id:<id>` - sells a card for its base value
- `/market view [page]` - browses market listings
- `/market list card_id:<id> price:<price>` - lists a card for sale
- `/market buy listing_id:<id>` - buys a card from the market
- `/market cancel listing_id:<id>` - cancels your own listing
- `/trade user:<player> your_card:<id> their_card:<id>` - proposes a card trade
- `/top [by]` - shows a leaderboard by `balance`, `cards`, or `rarity`

### Administrator Commands

- `/setup channel:<channel> interval:<h> packs:<number> [excluded_role]` - saves the server configuration

## Pack Types

- `Basic Pack` - the cheapest pack and the free `/setup` drop, mostly focused on `Common` and `Uncommon`
- `Adventurer Pack` - better odds for mid tiers and rare cards
- `Royal Pack` - a more expensive pack with stronger high-tier odds
- `Celestial Pack` - the most expensive pack, with the strongest odds for top tiers

`Basic Pack` remains the recurring free pack granted by `/setup`, so the hourly/free-pack system still works. Other packs are bought with coins earned by selling and trading cards.

## Card Tiers

The bot has 25 card tiers:

1. `Common I`
2. `Common II`
3. `Uncommon I`
4. `Uncommon II`
5. `Rare I`
6. `Rare II`
7. `Epic I`
8. `Epic II`
9. `Legendary I`
10. `Legendary II`
11. `Mythic I`
12. `Mythic II`
13. `Exotic I`
14. `Exotic II`
15. `Ancient I`
16. `Ancient II`
17. `Divine I`
18. `Divine II`
19. `Transcendent`
20. `Valentine` - event card
21. `Easter` - event card
22. `Halloween` - event card
23. `Christmas` - event card
24. `Horse Day` - event card
25. `Celestial`

Event cards are always available in the regular roll pool, but their drop rates are extremely low. In practice they are very rare, and `Celestial` is even rarer.

### Developer Mode

When `NODE_ENV=development`, an extra `/dev` command is available with testing tools such as adding packs, coins, and cards.

## Useful Scripts

```bash
npm run deploy
npm run deploy:prod
npm run lint
npm run lint:fix
npm run format
```

## Deploy To Your Own Server

The repo includes a simple deployment script for any SSH-accessible server:

```bash
npm run deploy:prod
```

The script:

- packages the current repo without `.env`, `.git`, and `node_modules`
- uploads the archive to the server from `DEPLOY_HOST`
- creates or updates the Kubernetes namespace and secret
- builds the Docker image on the server
- imports the image into K3s by default
- updates the deployment using names configured in `.env`
- loads `src/db/schema.sql` into the configured production database
- re-registers Discord slash commands

Before running it, make sure that:

- SSH access to `DEPLOY_HOST` is configured
- Docker, `kubectl`, and K3s are available on the server, or you have adjusted the commands for your runtime
- your local `.env` contains current `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DEPLOY_DATABASE_URL`, and `DEPLOY_HOST` values

Default remote commands:

```env
DEPLOY_KUBECTL_CMD=sudo kubectl
DEPLOY_DOCKER_CMD=sudo docker
DEPLOY_IMAGE_IMPORT_CMD=sudo k3s ctr images import
DEPLOY_SKIP_IMAGE_IMPORT=false
```

If you use a regular Kubernetes cluster with a registry instead of K3s image import, set your own `DOCKER_IMAGE`, push the image through your own workflow, or set `DEPLOY_SKIP_IMAGE_IMPORT=true` and adapt the deployment process for your server.
