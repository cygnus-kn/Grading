require('dotenv').config({ quiet: true });

const express = require('express');
const { CLASS_FOLDERS } = require('./config/classFolders');
const { supabase } = require('./config/supabase');
const {
  detectChangedClassIds,
  getClassIdsFromSupabase,
  setSyncPageToken,
  syncClassToSupabase,
} = require('./services/supabaseMetadataService');

function normalizeRequestedClasses(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)].filter(Boolean);
}

async function getSyncTargets(requestedClasses = []) {
  if (requestedClasses.length > 0) return [...new Set(requestedClasses)].sort();

  if (!supabase) return Object.keys(CLASS_FOLDERS).sort();

  const supabaseClassIds = await getClassIdsFromSupabase();
  return [...new Set([...supabaseClassIds, ...Object.keys(CLASS_FOLDERS)])].sort();
}

function isAuthorized(req) {
  const secret = process.env.SYNC_WORKER_SECRET;
  if (!secret) return !process.env.K_SERVICE;
  return req.get('x-sync-worker-secret') === secret;
}

async function syncTargets(targets) {
  const refreshed = {};
  const errors = {};

  for (const classId of targets) {
    try {
      console.log(`[worker] Syncing ${classId} from Drive to Supabase...`);
      const result = await syncClassToSupabase(classId);
      refreshed[classId] = result;
    } catch (error) {
      console.error(`[worker] Failed to sync ${classId}:`, error);
      errors[classId] = error.message || 'Failed to sync class';
    }
  }

  return { refreshed, errors };
}

function createWorkerApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      supabaseConfigured: Boolean(supabase),
      driveConfigured: Boolean(require('./config/googleDrive').drive),
    });
  });

  app.post('/sync', async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized sync request' });
    }

    if (!process.env.SYNC_WORKER_SECRET && process.env.K_SERVICE) {
      return res.status(500).json({ error: 'SYNC_WORKER_SECRET is required on Cloud Run' });
    }

    if (!supabase) {
      return res.status(503).json({ error: 'Supabase is not configured' });
    }

    const startedAt = new Date();
    const forceFullSync = req.query.force === 'true' || req.body?.force === true;
    const requestedClasses = [
      ...normalizeRequestedClasses(req.query.class),
      ...normalizeRequestedClasses(req.body?.class),
      ...normalizeRequestedClasses(req.body?.classes),
    ];

    try {
      let targets;
      let skipped = [];
      let changeDetection = null;

      if (forceFullSync || requestedClasses.length > 0) {
        // Force mode or specific classes requested: skip change detection
        targets = await getSyncTargets(requestedClasses);
        console.log(`[worker] Full sync requested for ${targets.length} class(es)`);
      } else {
        // Incremental mode: detect which classes changed
        const detection = await detectChangedClassIds();
        changeDetection = {
          allClasses: detection.allClasses || false,
          changedCount: detection.changedClassIds?.size ?? 'all',
        };

        const allTargets = await getSyncTargets();

        if (detection.allClasses) {
          targets = allTargets;
          console.log(`[worker] First run or unknown changes — syncing all ${targets.length} class(es)`);
        } else {
          targets = allTargets.filter(id => detection.changedClassIds.has(id));
          skipped = allTargets.filter(id => !detection.changedClassIds.has(id));
          console.log(`[worker] Incremental: syncing ${targets.length}, skipping ${skipped.length}`);
        }

        // Save the new page token after detection (before syncing, so even if sync
        // fails for some classes we don't re-process the same changes next run)
        if (detection.newToken) {
          await setSyncPageToken(detection.newToken);
        }
      }

      const { refreshed, errors } = await syncTargets(targets);
      const endedAt = new Date();
      const hasErrors = Object.keys(errors).length > 0;

      res.status(hasErrors ? 500 : 200).json({
        success: !hasErrors,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        targets,
        skipped,
        changeDetection,
        refreshed,
        errors,
      });
    } catch (error) {
      console.error('[worker] Sync run failed:', error);
      res.status(500).json({ error: error.message || 'Sync run failed' });
    }
  });

  return app;
}

module.exports = createWorkerApp;
