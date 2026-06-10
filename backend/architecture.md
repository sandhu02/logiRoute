backend/
├── src/
│   ├── config/           # Kafka, Redis, DB connections
│   ├── middleware/       # tenantResolver, auth, rateLimiter
│   ├── modules/
│   │   ├── tenant/       # tenant model & resolver
│   │   ├── driver/       # driver CRUD, status mgmt
│   │   ├── order/        # order service & Kafka producer
│   │   ├── dispatch/     # matchmaker logic, accept/decline
│   │   └── telemetry/    # ingestion endpoint, Kafka producer
│   ├── workers/
│   │   ├── trackingWorker.js
│   │   └── matchmakerWorker.js
│   ├── socket/           # Socket.IO server, room management
│   ├── app.js            # Express app
│   └── server.js         # Entrypoint (HTTP + WS)
├── docker-compose.yml    # Kafka, Redis, Postgres for dev
├── package.json
└── .env