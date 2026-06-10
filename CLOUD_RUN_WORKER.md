# Google Cloud Run Sync Worker

This worker runs the Google Drive -> Supabase metadata sync outside Vercel.
The website can keep reading fast metadata from Supabase while Cloud Run keeps
that metadata fresh on a schedule.

## Files

- `worker.js`: Cloud Run entrypoint.
- `src/workerApp.js`: HTTP worker with `GET /health` and `POST /sync`.
- `Dockerfile.worker`: container build for Cloud Run.

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CREDENTIALS`
- `SYNC_WORKER_SECRET`

`GOOGLE_CREDENTIALS` should contain the service account JSON that can read the
class Drive folders. `SYNC_WORKER_SECRET` should be a random string used as a
shared header secret by Cloud Scheduler.

## Local Smoke Test

```bash
SYNC_WORKER_SECRET=local-secret npm run start:worker
```

In another terminal:

```bash
curl -X POST http://localhost:8080/sync \
  -H "X-Sync-Worker-Secret: local-secret" \
  -H "Content-Type: application/json" \
  -d '{"class":"S136"}'
```

Omit the body to sync every class:

```bash
curl -X POST http://localhost:8080/sync \
  -H "X-Sync-Worker-Secret: local-secret"
```

## Deploy To Cloud Run

Set these shell variables first:

```bash
PROJECT_ID="your-gcp-project-id"
REGION="asia-southeast1"
SERVICE="grading-sync-worker"
REPOSITORY="grading-workers"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$SERVICE:latest"
```

Enable the required Google Cloud APIs:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com
```

Create the Docker repository once:

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION"
```

Build and deploy:

```bash
gcloud builds submit \
  --config cloudbuild.worker.yaml \
  --substitutions "_IMAGE=$IMAGE" \
  .

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --set-env-vars "SUPABASE_URL=$SUPABASE_URL" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
  --set-env-vars "GOOGLE_CREDENTIALS=$GOOGLE_CREDENTIALS" \
  --set-env-vars "SYNC_WORKER_SECRET=$SYNC_WORKER_SECRET"
```

For production, prefer Secret Manager instead of passing secrets directly in
the deploy command.

## Schedule It

Create a Cloud Scheduler service account and grant it permission to invoke the
Cloud Run service. Then create a scheduler job that sends a POST request:

```bash
WORKER_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
SCHEDULER_SA="cloud-scheduler-grading@$PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create cloud-scheduler-grading \
  --display-name "Cloud Scheduler Grading Sync"

gcloud run services add-iam-policy-binding "$SERVICE" \
  --region "$REGION" \
  --member "serviceAccount:$SCHEDULER_SA" \
  --role "roles/run.invoker"

gcloud scheduler jobs create http grading-sync-hourly \
  --location "$REGION" \
  --schedule "*/15 17,19 * * *" \
  --time-zone "Asia/Ho_Chi_Minh" \
  --uri "$WORKER_URL/sync" \
  --http-method POST \
  --oidc-service-account-email "$SCHEDULER_SA" \
  --headers "X-Sync-Worker-Secret=$SYNC_WORKER_SECRET"
```

## What Success Looks Like

The worker now uses the **Drive Changes API** for incremental sync. On each run it asks
Drive "what changed since last time?" and only re-syncs classes that actually had changes.

### Normal run (some classes changed)

```json
{
  "success": true,
  "startedAt": "...",
  "endedAt": "...",
  "durationMs": 12000,
  "targets":  ["S133"],
  "skipped":  ["S136", "S141"],
  "changeDetection": { "allClasses": false, "changedCount": 1 },
  "refreshed": {
    "S133": { "students": 28, "days": 30, "submissions": 840, "submissionFiles": 1680 }
  },
  "errors": {}
}
```

### Idle run (nothing changed in Drive)

```json
{
  "success": true,
  "targets":  [],
  "skipped":  ["S133", "S136", "S141"],
  "changeDetection": { "allClasses": false, "changedCount": 0 },
  "refreshed": {},
  "errors": {}
}
```

### First-ever run (no page token stored yet)

On the very first run there is no stored page token, so the worker does a full
sync of every class to build a baseline, then saves the token for future runs.
`changeDetection.allClasses` will be `true`.

### Force a full re-crawl

Pass `?force=true` (or `"force": true` in the request body) to bypass change
detection and re-crawl every class unconditionally — useful for recovery after
a schema migration or when you suspect the page token is stale:

```bash
curl -X POST "$WORKER_URL/sync?force=true" \
  -H "X-Sync-Worker-Secret: $SYNC_WORKER_SECRET"
```

If a class fails, the worker still returns HTTP 500 so Cloud Scheduler can mark
the run as failed and retry according to its retry policy.
