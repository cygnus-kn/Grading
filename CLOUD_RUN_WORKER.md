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
REGION="us-central1"
SERVICE="grading-sync-worker"
IMAGE="gcr.io/$PROJECT_ID/$SERVICE"
```

Enable the required Google Cloud APIs:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com
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
  --schedule "0 * * * *" \
  --uri "$WORKER_URL/sync" \
  --http-method POST \
  --oidc-service-account-email "$SCHEDULER_SA" \
  --headers "X-Sync-Worker-Secret=$SYNC_WORKER_SECRET"
```

## What Success Looks Like

The response should include:

- `success: true`
- `targets`: class IDs that were synced
- `refreshed`: per-class counts for students, days, submissions, and files
- `errors: {}`

If a class fails, the worker returns HTTP 500 so Cloud Scheduler can mark the
run as failed and retry according to its retry policy.
