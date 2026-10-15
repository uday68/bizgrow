# Reproducible 10-Step Verification & Demo Fixture

This end-to-end demo guide verifies the entire BizGrow platform completely offline without requiring external paid cloud subscriptions or accounts.

---

### Step 1: Verify .NET 8 SDK & Node.js Runtime
Run the runtime checks from the repository root:
```bash
node --version
npm --version
dotnet --version
```
*Expected Result:*
- Node.js >= 18.x
- npm >= 9.x
- .NET SDK >= 8.0.x (e.g. 8.0.426)

---

### Step 2: Run C#/.NET 8 Connector Service Tests
Execute the 9 unit and integration tests covering delta syncs, 429 throttling backoff, worker leases, and crash recovery:
```bash
dotnet test tests/BizGrow.Connectors.Tests/BizGrow.Connectors.Tests.csproj
```
*Expected Result:* `Passed! - Failed: 0, Passed: 9, Skipped: 0`

---

### Step 3: Run Node.js Multi-Tenant & Security Test Suite
Execute the core test suites in the `server/` directory:
```bash
cd server
npm test -- tests/tenant-isolation.test.js tests/auth.property.test.js tests/security.property.test.js tests/database.property.test.js tests/migration.property.test.js
cd ..
```
*Expected Result:* `Test Suites: 5 passed, 5 total. Tests: 30 passed, 30 total.`

---

### Step 4: Verify Frontend Build & Bundle Security
Build the React production bundle to verify zero TypeScript errors and verify that no secret keys are leaked:
```bash
npm run build
```
*Expected Result:* Clean build output in `dist/`, bundle size reduced by ~300 kB with zero direct AI key exposure.

---

### Step 5: Start the C#/.NET 8 Connector Service
In a terminal, launch the .NET 8 connector service:
```bash
dotnet run --project src/BizGrow.Connectors/BizGrow.Connectors.csproj --urls "http://127.0.0.1:5150"
```
*Expected Result:* Service starts listening on `http://127.0.0.1:5150`. `SyncWorkerService` background engine initializes and reports running state.

---

### Step 6: Test .NET Service Health Directly
In a new terminal, check the health endpoint:
```bash
curl -i http://127.0.0.1:5150/health
```
*Expected Result:* HTTP 200 OK with JSON response indicating all providers are `Healthy`.

---

### Step 7: Start the Node.js API Gateway & Web Application
In another terminal, launch the Node.js backend:
```bash
npm --prefix server start
```
*Expected Result:* Express server starts on `http://localhost:5000` with database initialized and security middleware active.

---

### Step 8: Verify Gateway Connection Test via API
Test the mutual authentication between Node.js and .NET 8:
```bash
curl -X POST http://localhost:5000/api/connectors/mock/test-connection \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: tenant-alpha"
```
*Expected Result:* HTTP 200 OK returning verified account details and connector health latency.

---

### Step 9: Trigger Asynchronous Ingestion Sync
Trigger a full sync followed by a delta sync:
```bash
# Full baseline sync
curl -X POST http://localhost:5000/api/connectors/sync/trigger \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: tenant-alpha" \
  -d '{"provider":"mock","mode":"Full"}'

# Inspect synced documents
curl http://localhost:5000/api/connectors/mock/documents \
  -H "X-Tenant-Id: tenant-alpha"
```
*Expected Result:* Job is enqueued, processed by `SyncWorkerService`, and 10 enterprise documents with granular user/group ACLs are stored in the database.

---

### Step 10: Explore the React Enterprise Connector Dashboard
Start the Vite development server:
```bash
npm run dev
```
Open your browser at `http://localhost:5173`:
1. Log in with demo credentials.
2. Navigate to **Connectors & Ingestion** in the sidebar.
3. Review the live health cards for **Microsoft 365** and **Deterministic Mock Provider**.
4. Click **Test Connection** to inspect real-time latency and account status.
5. Click **Enqueue Sync Job** to observe real-time job lease execution and document ingestion.
6. Switch to **Ingested Documents & ACLs** to inspect document permissions, versions, and paths.
7. Switch to **Architecture & Reliability Spec** to review the technical defenses.
