import { hex, int, pick, type Rng } from './random';
import type { Impact, Severity } from './types';

/**
 * Static description of the fake platform the simulator emits logs for.
 * Everything here is data — the simulator owns all behaviour.
 */

export type Template = (r: Rng) => string;

export interface ServiceDef {
  readonly name: string;
  readonly team: string;
  readonly hostPrefix: string;
  /** Relative traffic weight. */
  readonly weight: number;
  readonly info: readonly Template[];
  readonly warn: readonly Template[];
  readonly error: readonly Template[];
}

const route = (r: Rng) =>
  pick(r, [
    '/api/v1/orders',
    '/api/v1/orders/:id',
    '/api/v1/cart',
    '/api/v1/checkout',
    '/api/v1/users/me',
    '/api/v1/search',
    '/api/v1/products/:sku',
    '/healthz',
  ]);
const method = (r: Rng) => pick(r, ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE']);
const ms = (r: Rng, lo = 3, hi = 180) => `${int(r, lo, hi)}ms`;
const user = (r: Rng) => `usr_${hex(r, 8)}`;
const order = (r: Rng) => `ord_${hex(r, 10)}`;
const sku = (r: Rng) => `SKU-${int(r, 10000, 99999)}`;

export const SERVICES: readonly ServiceDef[] = [
  {
    name: 'api-gateway',
    team: 'edge',
    hostPrefix: 'gw',
    weight: 5,
    info: [
      (r) => `${method(r)} ${route(r)} 200 ${ms(r)}`,
      (r) => `${method(r)} ${route(r)} 201 ${ms(r, 10, 240)}`,
      (r) => `${method(r)} ${route(r)} 304 ${ms(r, 1, 12)}`,
      (r) => `upstream keepalive pool size=${int(r, 32, 128)} active=${int(r, 2, 30)}`,
    ],
    warn: [
      (r) => `${method(r)} ${route(r)} 429 rate limit exceeded client=${hex(r, 6)}`,
      (r) => `slow upstream response ${ms(r, 900, 2400)} route=${route(r)}`,
    ],
    error: [(r) => `${method(r)} ${route(r)} 502 bad gateway upstream reset after ${ms(r, 50, 400)}`],
  },
  {
    name: 'auth-service',
    team: 'identity',
    hostPrefix: 'auth',
    weight: 3,
    info: [
      (r) => `token issued sub=${user(r)} ttl=3600s scope="read write"`,
      (r) => `session refreshed sub=${user(r)} in ${ms(r, 2, 20)}`,
      () => `JWKS cache hit kid=rsa-2026-09`,
    ],
    warn: [
      (r) => `failed login attempt sub=${user(r)} reason=invalid_password attempts=${int(r, 2, 4)}`,
      (r) => `token near expiry sub=${user(r)} remaining=${int(r, 5, 55)}s`,
    ],
    error: [(r) => `signature verification failed kid=rsa-2026-0${int(r, 1, 8)} alg=RS256`],
  },
  {
    name: 'payments-api',
    team: 'payments',
    hostPrefix: 'pay',
    weight: 3,
    info: [
      (r) => `charge authorized order=${order(r)} amount=${int(r, 5, 900)}.${int(r, 10, 99)} EUR`,
      (r) => `refund processed order=${order(r)} in ${ms(r, 40, 300)}`,
      (r) => `webhook delivered provider=stripe event=payment_intent.succeeded ${ms(r)}`,
    ],
    warn: [
      (r) => `provider latency high p99=${ms(r, 800, 1900)} provider=adyen`,
      (r) => `idempotency key replay key=${hex(r, 12)}`,
    ],
    error: [(r) => `charge declined order=${order(r)} code=card_declined`],
  },
  {
    name: 'orders-svc',
    team: 'commerce',
    hostPrefix: 'ord',
    weight: 4,
    info: [
      (r) => `order created ${order(r)} items=${int(r, 1, 7)} user=${user(r)}`,
      (r) => `order state transition ${order(r)} PENDING -> CONFIRMED`,
      (r) => `outbox flushed events=${int(r, 1, 40)} in ${ms(r, 2, 40)}`,
    ],
    warn: [(r) => `optimistic lock retry ${order(r)} attempt=${int(r, 2, 3)}`],
    error: [(r) => `failed to publish OrderCreated ${order(r)}: broker unavailable`],
  },
  {
    name: 'inventory',
    team: 'commerce',
    hostPrefix: 'inv',
    weight: 3,
    info: [
      (r) => `stock reserved ${sku(r)} qty=${int(r, 1, 5)}`,
      (r) => `reservation released ${sku(r)} reason=timeout`,
      (r) => `cache warmup complete skus=${int(r, 1000, 9000)} in ${ms(r, 200, 900)}`,
    ],
    warn: [(r) => `low stock ${sku(r)} remaining=${int(r, 0, 4)}`],
    error: [(r) => `reservation conflict ${sku(r)}: negative stock prevented`],
  },
  {
    name: 'search-indexer',
    team: 'discovery',
    hostPrefix: 'idx',
    weight: 2,
    info: [
      (r) => `indexed batch docs=${int(r, 50, 500)} took=${ms(r, 30, 400)}`,
      (r) => `segment merge completed segments=${int(r, 2, 12)}`,
    ],
    warn: [(r) => `heap usage ${int(r, 78, 89)}% gc_pause=${ms(r, 120, 480)}`],
    error: [() => `bulk request rejected: es_rejected_execution_exception`],
  },
  {
    name: 'notification-worker',
    team: 'engagement',
    hostPrefix: 'ntf',
    weight: 2,
    info: [
      (r) => `email sent template=order_confirmation to=${user(r)}`,
      (r) => `push delivered platform=${pick(r, ['ios', 'android'])} ${ms(r, 20, 200)}`,
    ],
    warn: [(r) => `smtp retry scheduled attempt=${int(r, 2, 5)} backoff=${int(r, 2, 30)}s`],
    error: [() => `template render failed: missing variable "firstName"`],
  },
  {
    name: 'postgres-primary',
    team: 'data-platform',
    hostPrefix: 'pg',
    weight: 2,
    info: [
      (r) => `checkpoint complete: wrote ${int(r, 100, 4000)} buffers (${int(r, 1, 9)}.${int(r, 0, 9)}%)`,
      (r) => `autovacuum: table "orders" removed ${int(r, 100, 9000)} dead tuples`,
      (r) => `connections active=${int(r, 40, 120)} idle=${int(r, 10, 60)} max=200`,
    ],
    warn: [(r) => `duration: ${ms(r, 1000, 4000)} statement: SELECT * FROM order_items WHERE order_id = $1`],
    error: [() => `deadlock detected on relation "inventory_reservations"`],
  },
  {
    name: 'redis-cache',
    team: 'data-platform',
    hostPrefix: 'redis',
    weight: 2,
    info: [
      (r) => `keyspace hits=${int(r, 9000, 99999)} misses=${int(r, 10, 900)} hit_rate=0.9${int(r, 1, 9)}`,
      (r) => `RDB snapshot saved in ${ms(r, 100, 800)}`,
    ],
    warn: [(r) => `used_memory ${int(r, 82, 92)}% of maxmemory, evictions=${int(r, 10, 400)}`],
    error: [() => `MISCONF errors writing to disk, commands that may modify the data set are disabled`],
  },
  {
    name: 'kafka-broker',
    team: 'data-platform',
    hostPrefix: 'kafka',
    weight: 2,
    info: [
      (r) => `[ReplicaManager] ISR for partition orders-${int(r, 0, 11)} is stable`,
      (r) => `[Log partition=payments-${int(r, 0, 5)}] Rolled new log segment in ${ms(r, 1, 20)}`,
    ],
    warn: [(r) => `[Controller] consumer lag group=notifications lag=${int(r, 1000, 9000)}`],
    error: [(r) => `[ReplicaFetcher] Error for partition orders-${int(r, 0, 11)}: NOT_LEADER_OR_FOLLOWER`],
  },
];

export const SERVICE_NAMES: readonly string[] = SERVICES.map((s) => s.name);

export const SERVICE_BY_NAME: ReadonlyMap<string, ServiceDef> = new Map(
  SERVICES.map((s) => [s.name, s]),
);

export const REGIONS = ['eu-central-1', 'eu-west-1', 'us-east-1'] as const;

export interface ScenarioDef {
  readonly key: string;
  readonly title: string;
  readonly severity: Severity;
  readonly rootService: string;
  readonly affected: readonly { readonly name: string; readonly impact: Impact }[];
  readonly rootCause: {
    readonly summary: string;
    readonly detail: string;
    readonly signal: string;
  };
  /** Alert lines emitted by the root service. */
  readonly rootErrors: readonly Template[];
  /** Symptom lines emitted by affected (downstream) services. */
  readonly symptoms: readonly Template[];
  readonly mitigation: string;
  readonly stackTrace?: string;
  readonly actions: readonly string[];
  readonly runbook: string;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    key: 'pg-pool',
    title: 'Database connection pool exhausted',
    severity: 'SEV1',
    rootService: 'postgres-primary',
    affected: [
      { name: 'orders-svc', impact: 'down' },
      { name: 'payments-api', impact: 'degraded' },
      { name: 'api-gateway', impact: 'elevated-errors' },
    ],
    rootCause: {
      summary: 'Long-running analytics query held row locks, starving the connection pool.',
      detail:
        'A reporting job issued an unindexed sequential scan on order_items during peak traffic. ' +
        'Transactions queued behind its locks until all 200 connections were in use; new requests ' +
        'timed out at the pool after 30 s.',
      signal: 'pg_stat_activity.active > 195 for 2m',
    },
    rootErrors: [
      () => 'FATAL: remaining connection slots are reserved for non-replication superuser connections',
      (r) => `canceling statement due to lock timeout pid=${int(r, 10000, 60000)}`,
      (r) => `connections active=200 idle=0 waiting=${int(r, 40, 400)} max=200`,
    ],
    symptoms: [
      () => 'HikariPool-1 - Connection is not available, request timed out after 30000ms',
      (r) => `POST /api/v1/checkout 503 upstream timeout after ${int(r, 29000, 30500)}ms`,
      () => 'org.postgresql.util.PSQLException: This connection has been closed.',
    ],
    mitigation: 'terminated blocking backend and paused reporting job; pool draining',
    stackTrace: `com.zaxxer.hikari.pool.HikariPool$PoolInitializationException: Connection is not available
    at com.zaxxer.hikari.pool.HikariPool.createTimeoutException(HikariPool.java:696)
    at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:197)
    at com.rivyn.orders.repository.OrderRepository.save(OrderRepository.kt:88)
    at com.rivyn.orders.service.CheckoutService.placeOrder(CheckoutService.kt:142)
    at com.rivyn.orders.api.CheckoutController.checkout(CheckoutController.kt:51)`,
    actions: [
      'Terminate the blocking backend (pg_terminate_backend) for the reporting job',
      'Move analytics workloads to the read replica',
      'Add index on order_items(order_id, created_at)',
    ],
    runbook: 'https://runbooks.rivyn.dev/data/postgres-connection-exhaustion',
  },
  {
    key: 'redis-oom',
    title: 'Cache evictions causing auth latency spike',
    severity: 'SEV2',
    rootService: 'redis-cache',
    affected: [
      { name: 'auth-service', impact: 'degraded' },
      { name: 'api-gateway', impact: 'elevated-errors' },
    ],
    rootCause: {
      summary: 'Redis hit maxmemory; allkeys-lru evicted session keys faster than they were written.',
      detail:
        'A deploy of notification-worker started caching rendered templates without a TTL. ' +
        'Memory grew to 100% in 14 minutes and eviction churned hot session keys, forcing auth ' +
        'to fall back to the database on every request.',
      signal: 'redis_evicted_keys_total rate > 5k/s',
    },
    rootErrors: [
      () => 'OOM command not allowed when used memory > maxmemory',
      (r) => `evicted_keys=${int(r, 20000, 90000)} in last 60s policy=allkeys-lru`,
    ],
    symptoms: [
      (r) => `session lookup cache miss, falling back to db in ${int(r, 300, 1400)}ms`,
      (r) => `GET /api/v1/users/me 504 upstream timeout after ${int(r, 5000, 5100)}ms`,
    ],
    mitigation: 'flushed template:* keys and rolled back notification-worker v2.14.0',
    actions: [
      'Roll back notification-worker to v2.13.4',
      'Add TTL to template cache keys',
      'Alert on used_memory > 85% instead of 95%',
    ],
    runbook: 'https://runbooks.rivyn.dev/data/redis-memory-pressure',
  },
  {
    key: 'kafka-leader',
    title: 'Kafka partition leader election storm',
    severity: 'SEV2',
    rootService: 'kafka-broker',
    affected: [
      { name: 'orders-svc', impact: 'elevated-errors' },
      { name: 'notification-worker', impact: 'degraded' },
    ],
    rootCause: {
      summary: 'Broker kafka-2 lost its ZooKeeper session after a long GC pause, triggering re-elections.',
      detail:
        'A 14 s stop-the-world pause on kafka-2 exceeded the session timeout. Leadership for 36 ' +
        'partitions moved twice in five minutes and producers saw NOT_LEADER errors until metadata refreshed.',
      signal: 'kafka_controller_leader_elections_total rate > 10/min',
    },
    rootErrors: [
      (r) => `[Controller id=1] Partition orders-${int(r, 0, 11)} leader changed, epoch=${int(r, 40, 90)}`,
      () => '[KafkaServer id=2] Session expired, re-registering broker',
    ],
    symptoms: [
      (r) => `failed to publish OrderCreated ord_${hex(r, 10)}: NOT_LEADER_OR_FOLLOWER`,
      (r) => `consumer group notifications rebalancing, lag=${int(r, 10000, 80000)}`,
    ],
    mitigation: 'kafka-2 restarted with G1 tuned heap; ISR recovering',
    stackTrace: `org.apache.kafka.common.errors.NotLeaderOrFollowerException: This server is not the leader for that topic-partition.
    at org.apache.kafka.clients.producer.internals.Sender.completeBatch(Sender.java:634)
    at com.rivyn.orders.outbox.OutboxRelay.publish(OutboxRelay.kt:63)`,
    actions: [
      'Restart kafka-2 with tuned GC settings',
      'Increase zookeeper.session.timeout.ms to 18s',
      'Verify producer retries and idempotence are enabled',
    ],
    runbook: 'https://runbooks.rivyn.dev/streaming/kafka-leader-election',
  },
  {
    key: 'auth-jwks',
    title: 'JWT validation failures after key rotation',
    severity: 'SEV1',
    rootService: 'auth-service',
    affected: [
      { name: 'api-gateway', impact: 'down' },
      { name: 'payments-api', impact: 'elevated-errors' },
    ],
    rootCause: {
      summary: 'Signing key rotated before gateways refreshed the JWKS cache.',
      detail:
        'The scheduled key rotation published kid rsa-2026-10 but api-gateway pods cache JWKS for ' +
        '24 h. Tokens signed with the new key were rejected with 401 until caches were invalidated.',
      signal: 'http_requests_total{status="401"} ratio > 20%',
    },
    rootErrors: [
      () => 'unknown signing key kid=rsa-2026-10, JWKS cache stale',
      () => 'key rotation published kid=rsa-2026-10, previous key revoked',
    ],
    symptoms: [
      (r) => `GET /api/v1/orders 401 invalid token signature client=${hex(r, 6)}`,
      () => 'token introspection failed: kid not found in JWKS',
    ],
    mitigation: 'JWKS cache invalidated on all gateway pods; re-published previous key as secondary',
    actions: [
      'Invalidate JWKS caches on api-gateway',
      'Publish new keys 24h before activating them',
      'Reduce JWKS cache TTL to 10 minutes',
    ],
    runbook: 'https://runbooks.rivyn.dev/identity/jwks-rotation',
  },
  {
    key: 'indexer-oom',
    title: 'search-indexer OOMKilled in crash loop',
    severity: 'SEV3',
    rootService: 'search-indexer',
    affected: [{ name: 'api-gateway', impact: 'elevated-errors' }],
    rootCause: {
      summary: 'Unbounded bulk batch size after config change exhausted the container memory limit.',
      detail:
        'bulk.max_docs was changed from 500 to 50000. Each batch now buffers ~1.8 GB before flushing, ' +
        'exceeding the 1.5 GiB limit; pods are OOMKilled and restart in a loop.',
      signal: 'kube_pod_container_status_restarts_total increase > 5 in 10m',
    },
    rootErrors: [
      () => 'container search-indexer terminated: OOMKilled (exit code 137)',
      (r) => `java.lang.OutOfMemoryError: Java heap space (batch docs=${int(r, 40000, 50000)})`,
    ],
    symptoms: [(r) => `GET /api/v1/search 503 index unavailable ${int(r, 2, 40)}ms`],
    mitigation: 'reverted bulk.max_docs to 500, pods stable',
    stackTrace: `java.lang.OutOfMemoryError: Java heap space
    at java.base/java.util.Arrays.copyOf(Arrays.java:3537)
    at co.elastic.clients.json.JsonpUtils.serialize(JsonpUtils.java:212)
    at com.rivyn.search.BulkIndexer.flush(BulkIndexer.kt:97)`,
    actions: ['Revert bulk.max_docs to 500', 'Add config validation for batch sizes', 'Set heap to 75% of limit'],
    runbook: 'https://runbooks.rivyn.dev/discovery/indexer-oom',
  },
];
