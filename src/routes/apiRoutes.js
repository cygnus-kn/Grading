const express = require('express');
const { CLASS_FOLDERS, getClassConfig } = require('../config/classFolders');
const { supabase } = require('../config/supabase');
const { exportGoogleWorkspaceFile, streamAudio, streamDriveFile } = require('../services/driveService');
const {
  clearDayFoldersMemoryCache,
  clearSubmissionsCacheForClass,
  readDaysFileCache,
  readSubmissionsCache,
  writeDaysFileCache,
  writeSubmissionsCache,
} = require('../services/cacheService');
const {
  getDriveSubmissions,
  scanDaysForClass,
} = require('../services/submissionsService');
const {
  detectChangedClassIds,
  getClassIdsFromSupabase,
  getClassesFromSupabase,
  getDaysFromSupabase,
  getSubmissionsFromSupabase,
  setSyncPageToken,
  syncClassDayToSupabase,
  syncClassToSupabase,
  upsertComment,
} = require('../services/supabaseMetadataService');

const router = express.Router();

function getLocalClasses() {
  return Object.keys(CLASS_FOLDERS).map(id => ({
    id,
    days: readDaysFileCache(id) || [],
    lastSyncedAt: null,
  }));
}

async function getSyncTargetClassIds(classId) {
  if (classId) return [classId];
  if (!supabase) return Object.keys(CLASS_FOLDERS);

  const supabaseClassIds = await getClassIdsFromSupabase();
  return [...new Set([...supabaseClassIds, ...Object.keys(CLASS_FOLDERS)])].sort();
}

async function syncClassTargets(targets) {
  const results = {};

  for (const id of targets) {
    try {
      console.log(`[sync] Syncing ${id} from Drive to Supabase...`);
      const result = await syncClassToSupabase(id);
      results[id] = result.days;
    } catch (err) {
      results[id] = `error: ${err.message}`;
    }
  }

  return results;
}

function isCronAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return !process.env.VERCEL;
  return req.get('authorization') === `Bearer ${cronSecret}`;
}

router.get('/classes', async (req, res) => {
  if (supabase) {
    try {
      return res.json(await getClassesFromSupabase());
    } catch (error) {
      console.error('Supabase classes error; falling back to Drive config:', error);
    }
  }

  res.json(getLocalClasses());
});

router.get('/days', async (req, res) => {
  const { class: classId } = req.query;
  if (!classId) return res.status(400).json({ error: 'Class parameter required' });

  if (supabase) {
    try {
      return res.json(await getDaysFromSupabase(classId));
    } catch (error) {
      console.error('Supabase days error; falling back to Drive scan:', error);
    }
  }

  const classConfig = getClassConfig(classId);
  if (!classConfig) return res.json([]);

  const cached = readDaysFileCache(classId);
  if (cached) {
    console.log(`[cache] Serving days for ${classId} from file cache`);
    return res.json(cached);
  }

  console.log(`[cache] No cache for ${classId}, scanning Drive...`);
  try {
    const days = await scanDaysForClass(classId, classConfig);
    writeDaysFileCache(classId, days);
    res.json(days);
  } catch (error) {
    console.error('Error fetching days:', error);
    res.status(500).json({ error: 'Failed to fetch days' });
  }
});

router.post('/cache/refresh', async (req, res) => {
  const classId = req.body ? req.body.class : null;
  const targets = await getSyncTargetClassIds(classId);

  if (supabase) {
    try {
      let effectiveTargets = targets;
      let skipped = [];
      let detectionResult = null;

      // If a specific class is requested, force sync it. Otherwise use incremental detection.
      if (!classId) {
        detectionResult = await detectChangedClassIds();

        if (!detectionResult.allClasses) {
          effectiveTargets = targets.filter(id => detectionResult.changedClassIds.has(id));
          skipped = targets.filter(id => !detectionResult.changedClassIds.has(id));
        }
      }

      if (effectiveTargets.length === 0) {
        // Nothing changed — return immediately and save token
        console.log(`[sync] No Drive changes detected for ${targets.join(', ')} — skipping sync`);
        if (detectionResult && detectionResult.newToken) {
          await setSyncPageToken(detectionResult.newToken);
        }
        return res.json({
          refreshed: {},
          clearBrowserKeys: [],
          upToDate: true,
          skipped,
        });
      }

      const results = await syncClassTargets(effectiveTargets);
      
      // Check if any errors occurred during sync
      const hasErrors = Object.values(results).some(result => typeof result === 'string' && result.startsWith('error:'));
      
      if (detectionResult && detectionResult.newToken && !hasErrors) {
        await setSyncPageToken(detectionResult.newToken);
      } else if (detectionResult && detectionResult.newToken && hasErrors) {
        console.log(`[sync] Errors occurred during sync, not advancing page token.`);
      }

      const clearBrowserKeys = effectiveTargets.map(id => `gradingDays_${id}`);
      return res.json({ refreshed: results, clearBrowserKeys, skipped });
    } catch (error) {
      console.error('[sync] Incremental detection failed, falling back to full sync:', error.message);
      // Fall through to full sync on detection failure
      const results = await syncClassTargets(targets);
      const clearBrowserKeys = targets.map(id => `gradingDays_${id}`);
      return res.json({ refreshed: results, clearBrowserKeys });
    }
  }

  const results = {};
  for (const id of targets) {
    const classConfig = getClassConfig(id);
    if (!classConfig) continue;
    try {
      console.log(`[cache] Force refreshing ${id}...`);
      clearDayFoldersMemoryCache(id);
      const days = await scanDaysForClass(id, classConfig);
      writeDaysFileCache(id, days);
      clearSubmissionsCacheForClass(id);
      results[id] = days.length;
    } catch (err) {
      results[id] = `error: ${err.message}`;
    }
  }

  const clearBrowserKeys = targets.map(id => `gradingDays_${id}`);
  res.json({ refreshed: results, clearBrowserKeys });
});

router.get('/cron/sync', async (req, res) => {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized cron sync' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const allTargets = await getSyncTargetClassIds();
    let targets;
    let skipped = [];

    try {
      const detection = await detectChangedClassIds();

      if (detection.allClasses) {
        targets = allTargets;
      } else {
        targets = allTargets.filter(id => detection.changedClassIds.has(id));
        skipped = allTargets.filter(id => !detection.changedClassIds.has(id));
      }

      if (detection.newToken) {
        await setSyncPageToken(detection.newToken);
      }
    } catch (detectionError) {
      console.error('[cron] Change detection failed, falling back to full sync:', detectionError.message);
      targets = allTargets;
    }

    const results = await syncClassTargets(targets);
    res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      refreshed: results,
      skipped,
    });
  } catch (error) {
    console.error('Cron sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to run cron sync' });
  }
});

router.post('/sync/class', async (req, res) => {
  const classId = req.body ? req.body.class : null;
  if (!classId) return res.status(400).json({ error: 'Class parameter required' });

  try {
    const result = await syncClassToSupabase(classId);
    res.json({
      success: true,
      class: classId,
      result,
      clearBrowserKeys: [`gradingDays_${classId}`],
    });
  } catch (error) {
    console.error('Supabase sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync class' });
  }
});

router.post('/sync/day', async (req, res) => {
  const classId = req.body ? req.body.class : null;
  const day = req.body ? req.body.day : null;
  if (!classId || !day) {
    return res.status(400).json({ error: 'Class and day are required' });
  }

  try {
    const result = await syncClassDayToSupabase(classId, day);
    res.json({
      success: true,
      class: classId,
      day: Number(day),
      result,
      clearBrowserKeys: [
        `gradingDays_${classId}`,
        `gradingSubmissionsV4_${classId}_${day}`,
      ],
    });
  } catch (error) {
    console.error('Supabase day sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync day' });
  }
});

router.get('/submissions', async (req, res) => {
  const { class: classId, day } = req.query;

  if (!day || !classId) {
    return res.status(400).json({ error: 'Class and Day parameters are required' });
  }

  if (supabase) {
    try {
      const results = await getSubmissionsFromSupabase(classId, day);
      const submissionFileCount = results.reduce((total, student) => total + student.answers.length, 0);
      console.log(`[supabase] ${classId} day ${day}: ${results.length} students, ${submissionFileCount} submission files`);
      return res.json(results);
    } catch (error) {
      console.error('Supabase submissions error; falling back to Drive scan:', error);
    }
  }

  const classConfig = getClassConfig(classId);
  if (!classConfig) {
    console.warn(`No root folder configured for class: ${classId}`);
    return res.json([]);
  }

  const cached = readSubmissionsCache(classId, day);
  if (cached) {
    console.log(`[cache] Serving submissions for ${classId} day ${day} from memory cache`);
    return res.json(cached);
  }

  try {
    const results = await getDriveSubmissions(classId, classConfig, day);
    const submissionFileCount = results.reduce((total, student) => total + student.answers.length, 0);
    console.log(`[submissions] ${classId} day ${day}: ${results.length} students, ${submissionFileCount} submission files`);

    writeSubmissionsCache(classId, day, results);
    res.json(results);
  } catch (error) {
    console.error('Drive API Error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Google Drive' });
  }
});

router.get('/audio/:fileId', async (req, res) => {
  try {
    await streamAudio(req.params.fileId, res, req);
  } catch (error) {
    console.error('Audio Proxy Error:', error);
    res.status(500).send('Error fetching audio');
  }
});

router.get('/files/:fileId/content', async (req, res) => {
  try {
    await streamDriveFile(req.params.fileId, res, req);
  } catch (error) {
    console.error('Drive File Proxy Error:', error);
    res.status(500).send('Error fetching file');
  }
});

router.get('/files/:fileId/export', async (req, res) => {
  const format = String(req.query.format || 'pdf').toLowerCase();
  const exportMimeTypes = {
    pdf: 'application/pdf',
    text: 'text/plain',
  };

  const exportMimeType = exportMimeTypes[format];
  if (!exportMimeType) {
    return res.status(400).json({ error: 'Unsupported export format' });
  }

  try {
    await exportGoogleWorkspaceFile(req.params.fileId, exportMimeType, res);
  } catch (error) {
    console.error('Drive File Export Error:', error);
    res.status(500).send('Error exporting file');
  }
});

router.post('/feedback', async (req, res) => {
  const { class: classId, studentId, day, question, comment } = req.body || {};

  if (!classId || !studentId || !day || !question) {
    return res.status(400).json({ error: 'class, studentId, day, and question are required' });
  }

  if (!supabase) {
    // Fallback: log only when Supabase is not configured
    console.log(`[feedback] No Supabase — Student ${studentId}, Day ${day}, Q: ${question}, Comment: ${comment || ''}`);
    return res.json({ success: true, persisted: false });
  }

  try {
    const dayNumber = Number(day);
    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      return res.status(400).json({ error: 'Invalid day number' });
    }

    const saved = await upsertComment(classId, studentId, dayNumber, question, comment || '');
    console.log(`[feedback] Saved comment: ${classId}/${studentId}/day${dayNumber}/${question}`);
    res.json({ success: true, persisted: true, comment: saved });
  } catch (error) {
    console.error('[feedback] Error saving comment:', error);
    res.status(500).json({ error: error.message || 'Failed to save comment' });
  }
});

module.exports = router;
