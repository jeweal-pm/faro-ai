# ความรู้โดเมน: NestJS Backend ของ Gem Machine CRM

ฐานความรู้ตั้งต้นของ `senior-nestjs-developer` ซึ่ง**เขียนโค้ดจริง** ฉะนั้นความถูกต้องกับสภาพจริง
ของ repo สำคัญกว่าปกติ — ทุกอย่างใน
ไฟล์นี้ตรวจสอบกับโค้ดจริงแล้ว ณ วันที่เขียน (2026-08-06) เช็คซ้ำเสมอเพราะโค้ดเปลี่ยนได้เร็วกว่าเอกสาร

## Production resource budget

Production host capacity is **8 GB RAM / 4 vCPUs**. The current Compose limits total 3 vCPUs
and about 5.3 GB, leaving host headroom for the OS and Docker. Treat these as shared host
constraints; do not size each service as if it owns the whole machine.

- Bound PostgreSQL connection pools across services and replicas. Recalculate total connections
  against database capacity before changing pool size or replica count.
- Bound request fan-out, worker concurrency, queue retries, payload sizes, and in-memory caches;
  avoid unbounded `Promise.all` over user-controlled collections.
- Keep CPU-heavy work off request handlers. If a queue/worker is warranted, cap concurrency and
  account for its CPU/RAM in the same host budget before adding it.
- Set and review Docker Compose limits for every new service. Recalculate combined CPU/RAM limits
  and keep OS/Docker headroom when adding a service, replica, database, or cache.
- Treat client-IP rate limits as shared by the observed proxy address unless a trusted ingress is
  configured. Only read a forwarded-IP header that the ingress overwrites; never trust a
  client-supplied `X-Forwarded-For` value as an identity boundary.
- Validate resource decisions with observed production-like measurements when available. State
  assumptions and remaining capacity; do not claim the target is met from code review alone.

## 1. สถาปัตยกรรมจริงในโปรเจกต์นี้ (ตรวจสอบกับโค้ดแล้ว ไม่ใช่เดา)

นี่คือ **true NestJS microservices** ไม่ใช่ monolith — ต่างจาก `senior-nestjs-developer` ทั่วไปที่
มักเจอแค่ HTTP `@Controller()` เพียงอย่างเดียว โปรเจกต์นี้มี 2 รูปแบบ service คนละแบบ:

```text
Browser → Next.js :3100 → tRPC → NestJS Gateway :4000 (HTTP, @Controller + @Get/@Post)
                                     |-- TCP :4001 --> Auth service (PostgreSQL)
                                     |-- TCP :4002 --> Approval service (Redis/BullMQ)
                                     `-- TCP :4003 --> Notification service (Redis/BullMQ)
```

(ดู `docs/4. starter-architecture.md` — เอกสารต้นฉบับ ตรงกับโค้ดจริง)

- **Gateway (`backend-api-gateway`)** — เดียวที่เป็น HTTP app จริง (`NestFactory.create`,
  `app.listen(port, "0.0.0.0")`, `enableCors()`) มี `@Controller()` ปกติพร้อม `@Get()`/`@Post()`
  เป็นทางเข้าสาธารณะจุดเดียว **ไม่เขียน business logic ในนี้** — หน้าที่ของ controller ที่นี่คือ
  proxy คำขอไปยัง service ที่เกี่ยวข้องผ่าน `ClientProxy` แล้วรวม/แปลงผลลัพธ์ ดูตัวอย่างจริงที่ทำ
  ถูกแล้วใน `backend-api-gateway/src/app.controller.ts` (`AppController.getServicesHealth`,
  `getInfrastructureHealth`): `@Inject("AUTH_SERVICE") private readonly authClient: ClientProxy`
  (ชื่อ token มาจาก `ClientsModule.register([{name: "AUTH_SERVICE", transport: Transport.TCP,
  options: {host, port}}, ...])` ใน `app.module.ts`) แล้วเรียก
  `firstValueFrom(client.send({cmd: "..."}, payload).pipe(timeout(3_000)))` พร้อม try/catch คืน
  `{status: "unavailable", message}` ถ้า service ไม่ตอบ — **ทำตามแพทเทิร์น timeout + graceful
  degradation นี้เสมอเวลาเพิ่ม endpoint proxy ใหม่ที่ gateway**
- **Domain services (`backend-api-auth`, `backend-api-approval`, `backend-api-notification`)** —
  เป็น **pure TCP microservice** ไม่ใช่ HTTP app: bootstrap ด้วย
  `NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {transport: Transport.TCP,
  options: {host: "0.0.0.0", port}})` (ดู `backend-api-auth/src/main.ts`) **ไม่มี HTTP endpoint
  ในตัวเองเลย** ห้ามใช้ `@Get()`/`@Post()`/`@Controller("path")` ในนี้ — ใช้
  `@MessagePattern({cmd: "..."})` เท่านั้น (ดู `backend-api-auth/src/app.controller.ts`,
  `backend-api-approval/src/app.controller.ts` เป็นตัวอย่างจริง) ถ้างานต้องการ endpoint ใหม่ที่
  frontend เรียกได้ ต้องเพิ่มสองจุดเสมอคู่กัน: (1) `@MessagePattern` ใหม่ที่ domain service (2)
  `@Get()`/`@Post()` ใหม่ที่ gateway ที่ proxy ไปหา pattern นั้น — เพิ่มแค่จุดเดียวใช้งานไม่ได้
- **สถานะปัจจุบัน: เป็นแค่ starter/skeleton** — ตาม `docs/4. starter-architecture.md`: "Only health
  and dependency ping messages are implemented... Domain entities, authentication, authorization
  rules, and approval workflows are intentionally deferred" ทุก
  `modules/<domain>/<domain>.module.ts` (ทั้งฝั่ง gateway และ domain service) เป็น `@Module({})`
  เปล่า พร้อมคอมเมนต์บอกให้ใส่ controller/service/DTO/repository ในนี้ — **การสร้างส่วนที่ขาดคือ
  งานหลักของ agent นี้โดยตรง ไม่ใช่การเบี่ยงเบนจาก skeleton ที่มีอยู่**
- **Database: PostgreSQL ผ่าน `pg` (node-postgres) ตรง ๆ — ยังไม่มี ORM ติดตั้ง** (ไม่มี
  TypeORM/Prisma/Drizzle ใน `package.json` ไหนเลย) `backend-api-auth/src/database.service.ts` ใช้
  `new Pool({connectionString})` หรือ `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` จาก
  `ConfigService` แล้ว query ด้วย SQL ตรง ๆ (`pool.query<T>(sql)`) — **ถ้างานต้องการ schema/entity
  จริง (เช่น implement Authority Matrix/Tasks/Reports backend ตาม requirement doc) ต้องตัดสินใจ
  ว่าจะเพิ่ม ORM หรือเขียน SQL ตรงต่อไป — นี่คือการตัดสินใจสถาปัตยกรรมที่ต้อง flag ให้ผู้ใช้ยืนยันก่อน
  ห้ามเพิ่ม dependency ใหญ่ขนาดนี้เงียบ ๆ** (ดู non-negotiable ข้อ "New dependencies are
  justified")
- **Queue: BullMQ + Redis ผ่าน `@nestjs/bullmq`** — วางแบบไว้แล้วใน `backend-api-approval`:
  `BullModule.forRootAsync` (connection จาก `REDIS_HOST`/`REDIS_PORT`, default `localhost:6379`)
  + `BullModule.registerQueue({name: "approval-events"})` ใน `app.module.ts`, แล้ว
  `@InjectQueue("approval-events") private readonly queue: Queue` ใน controller/service (ดู
  `backend-api-approval/src/app.controller.ts`'s `pingQueue`) — `backend-api-notification` มี
  `@nestjs/bullmq` ติดตั้งเช่นกัน (คาดว่าจะมี queue ของตัวเอง เช่น `notification-events`) เพิ่ม
  queue ใหม่ตามแพทเทิร์นนี้ ไม่ใช่ตั้ง Redis client แยกเอง
- **Cache: `@nestjs/cache-manager` ที่ gateway เท่านั้น** — `CacheModule.register({isGlobal: true,
  max: 100, ttl: 5_000})` ใน `backend-api-gateway/src/app.module.ts` **⚠️ ไม่มี `store` ระบุ — เป็น
  in-memory cache ของ instance เดียว ไม่ใช่ Redis-backed** ใช้งานได้ตอนนี้เพราะรันแค่ 1 instance
  แต่จะพังทันทีที่ scale เป็นหลาย replica (แต่ละ instance เห็น cache คนละชุด, cache stampede ตอน
  deploy ใหม่) — เป็นช่องว่างที่มีอยู่จริงในโค้ดตอนนี้ ไม่ใช่สิ่งที่ควร copy ต่อถ้างานเกี่ยวกับ
  scaling/multi-replica ให้ flag ตรงนี้ก่อน ไม่ใช่เงียบแล้วเพิ่ม cache in-memory จุดใหม่ทับเข้าไปอีก
- **pnpm workspace** — `pnpm --filter <package-name> <script>` เสมอ (เช่น `pnpm --filter
  @gem-crm/backend-api-approval dev`) หรือ `pnpm -r <script>` จาก root **ห้าม `npm`/`yarn`**
  scripts ที่มีจริงในทุก `backend-api-*/package.json`: `dev` (`nest start --watch`), `build`
  (`nest build`), `start` (`node dist/main.js`), `typecheck`/`lint` (ทั้งคู่เป็น `tsc --noEmit` —
  **ไม่มี ESLint/Biome แยก เหมือนฝั่ง frontend**) **ไม่มี test runner เลยสักตัว** (ไม่มี
  jest/vitest ใน devDependencies ของ backend service ไหนเลย) — ห้ามอ้างว่า "เทสผ่านแล้ว" หรือสร้าง
  คำสั่ง `pnpm test` ที่ไม่มีจริง การไม่มี test infra คือสิ่งที่ต้องรายงาน ไม่ใช่สิ่งที่ต้องหลบ
  เลี่ยงเงียบ ๆ (เหมือนฝั่ง frontend เป๊ะ)
- **`.ai/ownership.yaml`** — สอง scope ต่อ domain: `backend-gateway-<domain>` (เช่น
  `backend-gateway-auth` = `backend-api-gateway/src/modules/auth/**`) กับ `backend-<domain>` (เช่น
  `backend-auth` = `backend-api-auth/src/modules/auth/**`) **`integration_owned` ครอบคลุม
  `backend-api-*/package.json`, `backend-api-*/src/app.module.ts`, `backend-api-*/src/main.ts` —
  ไฟล์เหล่านี้แก้ได้แต่ต้อง flag/coordinate ก่อนเสมอ ไม่ใช่ scope ที่เป็นเจ้าของเดี่ยว** เพราะกระทบ
  ทุก module ที่ import เข้าไป (เพิ่ม queue ใหม่ ต้องแก้ `app.module.ts` เช่น — เข้าข่ายนี้พอดี)

## 2. หลักที่ต้องทำตามเสมอ (Non-negotiables)

ปรับจาก `.codex/agents/senior-nestjs-developer.toml` ให้ตรงกับสภาพจริงของ repo นี้:

- **`ValidationPipe` แบบ `whitelist: true, forbidNonWhitelisted: true`** ที่ยังไม่เห็นตั้งไว้ที่ไหน
  เลยตอนนี้ (ทั้ง 4 service) — ต้องเพิ่มก่อนรับ input จริงจาก client ไม่งั้น client ส่ง
  `{"role":"admin"}` แปะเข้ามาแล้วติดได้ นี่คือบั๊กร้ายแรงที่พบบ่อยที่สุดใน Nest codebase
- **Controller (ทั้ง gateway และ domain service) ห้าม return entity ตรง ๆ** — ใช้ Response
  DTO/explicit serialization เสมอ ไม่งั้น column ใหม่ที่เพิ่มเข้า table จะหลุดไปหา client อัตโนมัติ
- **Authorization อยู่ใน Guard ฝั่ง server เท่านั้น** — เช็คที่ React (`lead-frontend-engineer`'s
  code) ไม่นับเป็น security เด็ดขาด (บทเรียนที่ project นี้ย้ำไว้แล้วฝั่ง frontend ด้วย — ตรงกัน)
- **ห้าม `Scope.REQUEST` ใน hot path** โดยไม่มีเหตุผลเป็นลายลักษณ์อักษร — มัน instantiate provider
  ทั้ง injection chain ใหม่ทุก request ใช้ `AsyncLocalStorage`/`nestjs-cls` แทนถ้าต้องมี
  request-context
- **ห้าม block event loop** — งาน CPU หนักไปที่ BullMQ queue (มีอยู่แล้วในโปรเจกต์นี้ ใช้ต่อได้เลย
  ไม่ต้องคิดกลไกใหม่) หรือ worker thread
- **ไม่มีอะไร unbounded** — `Promise.all` ต้องไม่วนกับ array ที่ไม่มีขอบเขต, ทุก call ออกนอก
  service (รวม `client.send()` ไป TCP service อื่น) ต้องมี timeout (ตัวอย่างจริงที่ gateway ใช้
  `timeout(3_000)` ทำถูกแล้ว — ใช้ pattern นี้ต่อ), DB pool size ต้องตั้งใจเลือกและเช็คกับจำนวน
  replica จริง (`pg.Pool` ตอนนี้ใช้ default ยังไม่ได้ตั้ง `max` เอง — ตรวจก่อนถ้างานเกี่ยวกับ
  connection pool)
- **ห้าม `synchronize: true`** ถ้ามีการเพิ่ม ORM ในอนาคต — schema change ต้องเป็น migration ที่
  commit ไว้เสมอ (ตอนนี้ยังไม่มี ORM เลยข้อนี้ยังไม่เกิดขึ้นจริง แต่เป็นกติกาที่ต้องยึดตั้งแต่วันแรก
  ถ้าจะเพิ่ม ORM)
- **`forwardRef()` คือสัญญาณของ module boundary ที่ผิด** ไม่ใช่ทางแก้ — แยก piece ที่ใช้ร่วมกันออก
  เป็น module ที่สาม
- **Shutdown hooks ต้องเปิดเสมอ** — ทุก `main.ts` ที่มีอยู่แล้วเปิดถูกต้องแล้ว
  (`app.enableShutdownHooks()`) ถ้าสร้าง service ใหม่ต้องมีด้วย ไม่งั้น deploy ใหม่แต่ละครั้งจะตัด
  request/job ที่กำลังทำอยู่ทิ้ง
- **Dependency ใหม่ต้องมีเหตุผล** — โดยเฉพาะ ORM (ดูหัวข้อ 1) เช็คสถานะ maintenance/compatibility
  กับ Nest version ปัจจุบันก่อนเพิ่มอะไรที่ไม่คุ้นเคยเสมอด้วยการค้นหาจริง อย่า pin เวอร์ชันจากความจำ
  — Nest major เปลี่ยน ecosystem package พังบ่อย (ทุก `package.json` ในนี้ pin `"latest"` ซึ่งเสี่ยง
  เองอยู่แล้ว ระวังเป็นพิเศษเวลาเพิ่มของใหม่เข้าไปให้เข้ากับ major ปัจจุบันจริง ๆ)
- **ไม่มีอะไร in-process ที่ต้องแชร์ข้าม replica** — cache/rate-limit counter/cron/event-emitter
  พังเงียบ ๆ ที่ 2 replica ขึ้นไป **gateway's `CacheModule` ตอนนี้เป็น in-memory ตามหัวข้อ 1 —
  รู้ไว้เป็นช่องว่างที่มีอยู่จริง ไม่ใช่แบบที่ควร copy ต่อ**
- **Hot path ต้องวัดจริง ไม่ใช่เดา** — claim เรื่อง performance ต้องมีตัวเลข (autocannon/k6/clinic.js
  profile) ประกอบ

## 3. Frontend mock router เป็น contract ที่ต้องตรวจสอบ

Frontend (Next.js/tRPC) ตอนนี้ทำงานได้เต็มรูปแบบด้วย **mock router ฝั่ง Next.js เอง**
(`frontend/src/server/routers/{approval,dashboard,authority-matrix,tasks,reports}.ts`) — นี่ไม่ใช่
เรื่องบังเอิญ เป็นเพราะ backend service (`backend-api-*`) ยังเป็นแค่ skeleton (หัวข้อ 1) ตอนที่
`lead-frontend-engineer` implement UI แต่ละหน้าไปแล้ว mock router พวกนี้คือ**เอกสารสัญญาที่แม่นยำ
ที่สุดที่มีอยู่ตอนนี้**ว่า shape ของ request/response ที่ frontend คาดหวังหน้าตาเป็นยังไง (เทียบกับ
`docs/requirement/full/*.md` และ `docs/design/*.md` อยู่แล้ว เพราะ mock ถูกสร้างตาม requirement
เดียวกัน) — **อ่าน mock router ที่เกี่ยวข้องก่อนเริ่ม implement backend จริงเสมอ** ใช้เป็นข้อกำหนด
shape ของ DTO/response ไม่ใช่คิดเอง

เมื่อ backend จริงพร้อมแทน mock:
1. Business rule ต้องตรงกับ requirement ใน `docs/requirement/full/` (ไม่ใช่แค่
   ตรงกับ mock — mock อาจมี shortcut ชั่วคราว เช่น comment
   "temporary pending a real backend" ในไฟล์ mock ทุกไฟล์ ให้เช็คคอมเมนต์พวกนี้)
2. ถ้า shape ของ response ต้องเปลี่ยนจาก mock เดิม (field เพิ่ม/หาย/เปลี่ยนชื่อ) ให้บันทึกเหตุผล
   และผลกระทบต่อ frontend ในเอกสารหรือ handoff ของงานก่อน integration — ดูหัวข้อ 5
3. `docs/changelog/README.md` (ถ้ามี) จะมี agent ID และ path ของ mock router implementation ล่าสุด
   — เช็คตรงนั้นก่อนว่าใครทำอะไรไปแล้วบ้างเกี่ยวกับ feature นี้

## 4. จัดการ business rule ที่ยังไม่ชัด

ห้ามเดา business rule เอง (เงื่อนไขอนุมัติ, การคิด SLA, ใครมีสิทธิ์ทำอะไร, edge case ของ workflow)
ไล่ตามลำดับนี้เสมอ:
1. ทวนกับ `docs/requirement/full/<เรื่องที่เกี่ยวข้อง>.md` ก่อนเสมอ — ส่วนใหญ่ตอบได้จากตรงนี้ถ้าอ่าน
   ครบ (Business Rules section + Data Requirements section)
2. ถ้าเอกสารยังไม่ตอบ ให้ถามผู้ใช้ก่อนลงมือกับ business rule ที่มีผลต่อสิทธิ์, workflow, SLA หรือ
   ข้อมูลที่บันทึก แล้วจดคำตอบไว้กับงาน

## 5. รักษา API contract

เรื่อง **shape ของ endpoint/message pattern** (field ไหนอยู่ใน request/response, error envelope
หน้าตาเป็นยังไง, HTTP status code ไหนสื่อความหมายอะไร) ให้ตัดสินจาก contract และ artifacts ที่มี:
- ก่อนเปลี่ยน shape ของ endpoint ที่ mock router มีอยู่แล้ว (หัวข้อ 3) ให้ถือว่า shape เดิมคือ
  ข้อตกลงเบื้องต้น เปลี่ยนได้แต่ต้องแจ้งเหตุผล (เช่น "field นี้ backend จริงคำนวณไม่ได้แบบ mock
  เพราะ...") ไม่ใช่เปลี่ยนเงียบ ๆ
- Error envelope ต้องสอดคล้องกันทั้งระบบ (gateway คืน error แบบเดียวกันทุก endpoint ให้ frontend
  handle แบบเดียวกันได้) — ถ้ายังไม่มีรูปแบบกลาง ให้เสนอรูปแบบพร้อมผลกระทบและขอผู้ใช้ทบทวนก่อนใช้
  ทั่วทั้ง gateway
- ถ้าเป็นไปได้ ให้พิจารณา publish OpenAPI/type spec จาก gateway เพื่อให้ frontend generate type
  แทนการเขียนมือ — ตรวจสอบก่อนว่ายังไม่มีอยู่
  ในโปรเจกต์ตอนนี้ ถ้าจะทำเป็นการเสนอใหม่ ไม่ใช่สิ่งที่ตั้งสมมติฐานว่ามีอยู่แล้ว

## 6. คำสั่ง verify

```
pnpm --filter @gem-crm/backend-api-<service> typecheck && pnpm --filter @gem-crm/backend-api-<service> build
```

แทน `<service>` ด้วย `gateway`/`auth`/`approval`/`notification` ตามที่แก้ (เช็คชื่อ package จริงใน
`package.json` ก่อนเสมอ เผื่อเปลี่ยน) หรือ `pnpm -r typecheck && pnpm -r build` ถ้าแก้หลาย service
พร้อมกัน `lint` คือ `tsc --noEmit` ซ้ำ (ไม่มี linter แยก) และไม่มีคำสั่ง test จริง — ห้ามอ้างว่ารันเทส
แล้วถ้าไม่มีคำสั่งให้รันจริง ห้ามรายงานว่างานเสร็จถ้ายังไม่ได้ typecheck+build จริง ถ้าแก้ทั้ง gateway
และ domain service พร้อมกัน (ปกติสำหรับ endpoint ใหม่ 1 อัน ตามหัวข้อ 1) ต้อง verify **ทั้งสอง
service** ไม่ใช่แค่อันที่แก้ทีหลัง

ถ้ามี docker compose รันอยู่ (`docker compose ps`) ให้เช็คว่า service ที่แก้ต้อง rebuild ก่อนไหม —
`node_modules`/`dist` ไม่ hot-reload ข้าม container โดยอัตโนมัติเสมอไป แนะนำ `pnpm --filter
@gem-crm/backend-api-<service> dev` (`nest start --watch`) รันตรงในเครื่องระหว่างพัฒนาแทน rebuild
image ทุกครั้ง (แนวทางเดียวกับที่แนะนำฝั่ง frontend ไปแล้ว)
