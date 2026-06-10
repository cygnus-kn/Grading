// ============================
//  Class / Day Data (dynamic)
// ============================
// Cache: classId -> { days: [{ day: N }], loaded: bool }
const CLASSES_DATA = {
    'S141': { days: [], loaded: false },
    'S133': { days: [], loaded: false },
    'S136': { days: [], loaded: false },
};

const DEFAULT_TABS = [];

document.addEventListener('DOMContentLoaded', () => {
    const sidebarNav = document.getElementById('sidebarNav');
    const sidebar = document.getElementById('sidebar');
    const resizeHandle = document.getElementById('sidebarResizeHandle');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    const themeToggle = document.getElementById('themeToggle');
    
    const daySelect = document.getElementById('day-select');
    const dayBadge = document.getElementById('dayBadge');
    const dayRefreshBtn = document.getElementById('dayRefreshBtn');
    const dayDropdown = document.getElementById('dayDropdown');
    const submissionsList = document.getElementById('submissions-list');
    const loadingIndicator = document.getElementById('loading-indicator');
    const tabsBar = document.getElementById('tabsBar');
    const workspace = document.querySelector('.container');
    const mainContent = document.querySelector('main');
    const APP_POSITION_KEY = 'gradingAppPosition';
    const SUBMISSIONS_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
    const SUBMISSIONS_CACHE_PREFIX = 'gradingSubmissionsV4_';
    const CLASS_AUTO_SYNC_KEY = 'gradingClassAutoSyncAt';
    const CLASS_AUTO_SYNC_MIN_INTERVAL_MS = 60 * 1000;
    const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

    // ============================
    //  Sidebar Logic
    // ============================
    const ICON_SIDEBAR_HTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <path class="sidebar-icon-fill" d="M3 3h6v18H3z" stroke="none"></path>
      <line x1="9" y1="3" x2="9" y2="21"></line>
    </svg>`;

    const updateSidebarIcon = (isCollapsed) => {
        if (collapseBtn) {
            if (!collapseBtn.querySelector('.sidebar-icon-fill')) {
                collapseBtn.innerHTML = ICON_SIDEBAR_HTML;
            }
            collapseBtn.classList.toggle('is-extended', !isCollapsed);
        }
    };

    const toggleSidebar = () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
        updateSidebarIcon(isCollapsed);
    };

    collapseBtn.addEventListener('click', toggleSidebar);

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
    });

    // --- INITIALIZATION ---
    // Load class folders and days
    fetch('/api/classes')
        .then(res => res.json())
        .then(classes => {
            classes.forEach(c => {
                if (!CLASSES_DATA[c.id]) {
                    CLASSES_DATA[c.id] = { days: [], loaded: false };
                }

                const days = Array.isArray(c.days) ? c.days : [];
                CLASSES_DATA[c.id].days = days;
                CLASSES_DATA[c.id].loaded = days.length > 0;
                CLASSES_DATA[c.id].lastSyncedAt = c.lastSyncedAt || null;
            });
            renderSidebar();
            restoreCurrentPosition();
        })
        .catch(err => console.error('Error loading classes:', err));

    const savedSidebarWidth = localStorage.getItem('sidebarWidth');
    if (savedSidebarWidth) {
        sidebar.style.width = savedSidebarWidth;
        document.documentElement.style.setProperty('--sidebar-width', savedSidebarWidth);
    }

    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }
    updateSidebarIcon(sidebar.classList.contains('collapsed'));

    let isResizing = false;
    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        sidebar.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.min(400, Math.max(240, e.clientX));
        sidebar.style.width = newWidth + 'px';
        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        sidebar.classList.remove('resizing');
        document.body.style.cursor = '';
        localStorage.setItem('sidebarWidth', sidebar.style.width);
    });

    function renderSidebar() {
        let html = '';
        const sortedEntries = Object.entries(CLASSES_DATA).sort(([a], [b]) => {
            if (a === 'S141') return -1;
            if (b === 'S141') return 1;
            return a.localeCompare(b);
        });
        for (const [className, data] of sortedEntries) {
            const iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-tertiary);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
            
            html += `
                <div class="class-group" data-class="${className}">
                    <div class="class-header" onclick="window.handleClassHeaderClick(event, '${className}')">
                        <div style="display:flex; align-items:center; gap:12px;">
                            ${iconSvg}
                            <span>${className}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <button
                                class="class-count-badge"
                                type="button"
                                title="Refresh days"
                                aria-label="Refresh days for ${className}"
                                onclick="window.refreshClassDays(event, '${className}')"
                            >
                                <span class="class-count-value">${data.days.length}</span>
                                <svg class="class-refresh-icon" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/>
                                    <path d="M3 21v-5h5"/>
                                    <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/>
                                    <path d="M21 3v5h-5"/>
                                </svg>
                                <span class="class-count-spinner" aria-hidden="true"></span>
                            </button>
                            <svg class="class-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </div>
                    </div>
                    <div class="class-sync-time" data-class="${className}">${formatSyncTime(data.lastSyncedAt)}</div>
                    <div class="class-children">
                        ${getClassDays(className).map(day => `
                            <div class="date-entry" data-class="${className}" data-day="${day.day}" onclick="window.selectHomework('${className}', '${day.day}')">
                                <span>${getDayLabel(className, day.day)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        sidebarNav.innerHTML = html;
    }

    // Surgically update day list for a single class (called after /api/days loads)
    function renderSidebarDays(className) {
        const group = sidebarNav.querySelector(`.class-group[data-class="${className}"]`);
        if (!group) return;

        const days = getClassDays(className);

        // Update badge count
        const badge = group.querySelector('.class-count-badge');
        if (badge) {
            badge.classList.remove('is-loading', 'is-error');
            badge.disabled = false;
            badge.setAttribute('aria-label', `Refresh days for ${className}`);
            const value = badge.querySelector('.class-count-value');
            if (value) value.textContent = days.length;
        }

        // Re-render children
        const children = group.querySelector('.class-children');
        if (children) {
            children.innerHTML = days.map(day => `
                <div class="date-entry" data-class="${className}" data-day="${day.day}" onclick="window.selectHomework('${className}', '${day.day}')">
                    <span>${getDayLabel(className, day.day)}</span>
                </div>
            `).join('');
        }
    }

    function updateSidebarSyncTime(className) {
        const el = sidebarNav.querySelector(`.class-sync-time[data-class="${className}"]`);
        if (el) el.textContent = formatSyncTime(CLASSES_DATA[className]?.lastSyncedAt);
    }

    function setClassRefreshState(className, state) {
        const badge = sidebarNav.querySelector(`.class-group[data-class="${className}"] .class-count-badge`);
        if (!badge) return;

        const isLoading = state === 'loading';
        const isError = state === 'error';
        badge.classList.toggle('is-loading', isLoading);
        badge.classList.toggle('is-error', isError);
        badge.disabled = isLoading;
        badge.setAttribute(
            'aria-label',
            isLoading
                ? `Refreshing days for ${className}`
                : isError
                    ? `Refresh failed for ${className}`
                    : `Refresh days for ${className}`
        );
    }

    window.handleClassHeaderClick = (event, className) => {
        openClassTab(className);
        window.toggleClassExpansion(event, className);
    };

    window.openClassFromSidebar = (className) => {
        openClassTab(className);
    };

    window.toggleClassExpansion = (event, className) => {
        event.stopPropagation();
        const group = document.querySelector(`.class-group[data-class="${className}"]`);
        group.classList.toggle('expanded');
        savePosition();
    };

    window.selectHomework = (className, day) => {
        openClassTab(className, day, { forceRefreshDay: true });
    };

    window.refreshClassDays = async (event, className) => {
        event.stopPropagation();
        event.preventDefault();

        try {
            await refreshClasses([className]);
        } catch (err) {
            console.error(`Failed to refresh ${className}:`, err);
            setClassRefreshState(className, 'error');
            window.setTimeout(() => setClassRefreshState(className, 'idle'), 1600);
        }
    };

    function getClassDays(className) {
        return [...(CLASSES_DATA[className]?.days || [])]
            .sort((a, b) => Number(b.day) - Number(a.day));
    }

    function getDayLabel(className, dayValue) {
        const dayNumber = String(dayValue).padStart(2, '0');
        return `Day ${dayNumber}`;
    }

    function formatSyncTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const syncDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        if (syncDay.getTime() === today.getTime()) {
            return `last updated ${hours}:${minutes}`;
        }
        if (syncDay.getTime() === yesterday.getTime()) {
            return 'last updated yesterday';
        }
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        return `last updated ${dd}/${mm}`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function getSubmissionFiles(student) {
        if (Array.isArray(student?.submissionFiles)) return student.submissionFiles;
        if (Array.isArray(student?.answers)) return student.answers;
        return [];
    }

    function getSubmissionDisplayName(submission) {
        return submission?.name || submission?.q || '';
    }

    function getSubmissionColumnName(submission) {
        return getSubmissionDisplayName(submission).replace(/\.[^/.]+$/, '');
    }

    function getFileExtension(fileName) {
        const match = String(fileName || '').toLowerCase().match(/\.[^.]+$/);
        return match ? match[0] : '';
    }

    function inferSubmissionKind(submission) {
        const kind = submission?.kind || submission?.fileKind;
        if (kind) return kind;

        const mimeType = String(submission?.mimeType || '').toLowerCase();
        const extension = getFileExtension(submission?.name);
        if (mimeType.startsWith('audio/') || ['.aac', '.aif', '.aiff', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav', '.webm', '.wma'].includes(extension)) return 'audio';
        if (mimeType.startsWith('image/') || ['.avif', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp'].includes(extension)) return 'image';
        if (
            mimeType === GOOGLE_DOC_MIME_TYPE ||
            mimeType === 'application/pdf' ||
            mimeType === 'application/msword' ||
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            ['.doc', '.docx', '.gdoc', '.odt', '.pdf', '.rtf', '.txt'].includes(extension)
        ) return 'document';
        return 'file';
    }

    function isGoogleDoc(submission) {
        return String(submission?.mimeType || '').toLowerCase() === GOOGLE_DOC_MIME_TYPE;
    }

    function isPdf(submission) {
        const mimeType = String(submission?.mimeType || '').toLowerCase();
        return mimeType === 'application/pdf' || getFileExtension(submission?.name) === '.pdf';
    }

    function getSubmissionContentUrl(submission) {
        if (submission?.contentUrl) return submission.contentUrl;
        if (submission?.audioUrl) return submission.audioUrl;
        return submission?.driveFileId ? `/api/files/${submission.driveFileId}/content` : '';
    }

    function getSubmissionExportPdfUrl(submission) {
        if (submission?.exportPdfUrl) return submission.exportPdfUrl;
        return submission?.driveFileId ? `/api/files/${submission.driveFileId}/export?format=pdf` : '';
    }

    function getSubmissionOpenUrl(submission) {
        if (submission?.webViewLink) return submission.webViewLink;
        return submission?.driveFileId ? `https://drive.google.com/file/d/${submission.driveFileId}/view` : '';
    }

    function getSubmissionFolderUrl(submission) {
        if (submission?.folderUrl) return submission.folderUrl;
        if (submission?.parentFolderId) return `https://drive.google.com/drive/folders/${submission.parentFolderId}`;
        return '';
    }

    function getSubmissionPreviewUrl(submission) {
        if (isGoogleDoc(submission)) return getSubmissionExportPdfUrl(submission);
        if (isPdf(submission)) return getSubmissionContentUrl(submission);
        if (submission?.drivePreviewUrl) return submission.drivePreviewUrl;
        return submission?.driveFileId ? `https://drive.google.com/file/d/${submission.driveFileId}/preview` : '';
    }

    function isKnownClass(className) {
        return Boolean(CLASSES_DATA[className]);
    }

    function isKnownDay(className, dayValue) {
        return getClassDays(className).some(item => String(item.day) === String(dayValue));
    }

    function clearSubmissionCacheForClass(className) {
        const prefixes = [
            `${SUBMISSIONS_CACHE_PREFIX}${className}_`,
            `gradingSubmissionsV3_${className}_`,
            `gradingSubmissionsV2_${className}_`,
            `gradingSubmissions_${className}_`
        ];
        Object.keys(localStorage).forEach(key => {
            if (prefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
        });
    }

    function clearSubmissionCacheForDay(className, day) {
        [
            SUBMISSIONS_CACHE_PREFIX,
            'gradingSubmissionsV3_',
            'gradingSubmissionsV2_',
            'gradingSubmissions_'
        ].forEach(prefix => {
            localStorage.removeItem(`${prefix}${className}_${day}`);
        });
    }

    function setDayRefreshState(state) {
        if (!dayRefreshBtn) return;
        const isLoading = state === 'loading';
        const isError = state === 'error';
        const hasDay = Boolean(activeTabId && daySelect.value);

        dayRefreshBtn.classList.toggle('is-loading', isLoading);
        dayRefreshBtn.classList.toggle('is-error', isError);
        dayRefreshBtn.disabled = isLoading || !hasDay;
        dayRefreshBtn.setAttribute(
            'aria-label',
            isLoading
                ? 'Refreshing selected day'
                : isError
                    ? 'Selected day refresh failed'
                    : 'Refresh selected day'
        );
    }

    async function refreshCurrentDay() {
        const className = activeTabId;
        const day = daySelect.value;
        if (!className || !day) return;

        setDayRefreshState('loading');

        try {
            const res = await fetch('/api/sync/day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ class: className, day })
            });
            if (!res.ok) throw new Error(`Day refresh failed with ${res.status}`);

            const result = await res.json();
            (result.clearBrowserKeys || []).forEach(key => localStorage.removeItem(key));
            clearSubmissionCacheForDay(className, day);

            const classData = CLASSES_DATA[className];
            if (classData) {
                classData.loaded = false;
                classData.days = [];
            }
            await loadDaysForClass(className);

            const nextDay = isKnownDay(className, day) ? String(day) : getLatestDayValue(className);
            updateDayOptions(className, nextDay);
            updateSidebarSelection(className, nextDay);
            if (nextDay) {
                selectDay(nextDay, { forceRefresh: true });
            } else {
                showEmptyWorkspace();
            }

            CLASSES_DATA[className].lastSyncedAt = new Date().toISOString();
            updateSidebarSyncTime(className);
            setDayRefreshState('idle');
        } catch (error) {
            console.error(`Failed to refresh ${className} day ${day}:`, error);
            setDayRefreshState('error');
            window.setTimeout(() => setDayRefreshState('idle'), 1600);
        }
    }

    function clearBrowserCachesForClasses(classNames, clearBrowserKeys = []) {
        clearBrowserKeys.forEach(key => localStorage.removeItem(key));
        classNames.forEach(className => {
            localStorage.removeItem(`gradingDays_${className}`);
            clearSubmissionCacheForClass(className);
            if (CLASSES_DATA[className]) {
                CLASSES_DATA[className].loaded = false;
                CLASSES_DATA[className].days = [];
            }
        });
    }

    async function refreshClasses(classNames) {
        const targetClassNames = [...new Set(classNames)].filter(isKnownClass);
        if (targetClassNames.length === 0) return null;

        targetClassNames.forEach(className => setClassRefreshState(className, 'loading'));

        const body = targetClassNames.length === 1
            ? JSON.stringify({ class: targetClassNames[0] })
            : undefined;
        const res = await fetch('/api/cache/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            ...(body ? { body } : {})
        });

        if (!res.ok) throw new Error(`Refresh failed with ${res.status}`);

        const result = await res.json();

        // Server detected no Drive changes — nothing to sync
        if (result.upToDate) {
            targetClassNames.forEach(className => {
                setClassRefreshState(className, 'idle');
            });
            return result;
        }

        const refreshedClassNames = [];
        const failedClassNames = [];
        targetClassNames.forEach(className => {
            const refreshedCount = result?.refreshed?.[className];
            if (typeof refreshedCount !== 'number') {
                failedClassNames.push(className);
                return;
            }
            refreshedClassNames.push(className);
        });

        if (failedClassNames.length === targetClassNames.length) {
            const [firstFailedClassName] = failedClassNames;
            const errorMessage = result?.refreshed?.[firstFailedClassName];
            throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Refresh failed');
        }

        clearBrowserCachesForClasses(refreshedClassNames, result.clearBrowserKeys || []);
        await Promise.all(refreshedClassNames.map(className => loadDaysForClass(className)));

        refreshedClassNames.forEach(className => {
            setClassRefreshState(className, 'idle');
            CLASSES_DATA[className].lastSyncedAt = new Date().toISOString();
            updateSidebarSyncTime(className);
        });
        failedClassNames.forEach(className => {
            setClassRefreshState(className, 'error');
            window.setTimeout(() => setClassRefreshState(className, 'idle'), 1600);
        });

        if (activeTabId && refreshedClassNames.includes(activeTabId)) {
            const currentDay = selectedDaysByClass[activeTabId];
            const latestDay = getLatestDayValue(activeTabId);
            const nextDay = currentDay && isKnownDay(activeTabId, currentDay) ? currentDay : latestDay;
            updateDayOptions(activeTabId, nextDay);
            updateSidebarSelection(activeTabId, nextDay);
            if (nextDay) selectDay(nextDay, { forceRefresh: true });
        }

        localStorage.setItem(CLASS_AUTO_SYNC_KEY, String(Date.now()));

        if (failedClassNames.length > 0) {
            console.warn('Some classes failed to refresh:', failedClassNames);
        }

        return result;
    }

    async function refreshAllClassesOnLoad() {
        const lastSyncAt = Number(localStorage.getItem(CLASS_AUTO_SYNC_KEY) || 0);
        if (Date.now() - lastSyncAt < CLASS_AUTO_SYNC_MIN_INTERVAL_MS) return;

        const classNames = Object.keys(CLASSES_DATA);
        try {
            await refreshClasses(classNames);
        } catch (error) {
            console.error('Automatic class sync failed:', error);
            classNames.forEach(className => setClassRefreshState(className, 'idle'));
        }
    }

    function readSubmissionCache(cacheKey) {
        const cachedData = localStorage.getItem(cacheKey);
        if (!cachedData) return null;

        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed)) {
            return { data: parsed, isFresh: false };
        }

        if (parsed && Array.isArray(parsed.data)) {
            const savedAt = Number(parsed.savedAt) || 0;
            return {
                data: parsed.data,
                isFresh: Date.now() - savedAt < SUBMISSIONS_CACHE_MAX_AGE_MS
            };
        }

        throw new Error('Invalid submissions cache');
    }

    function writeSubmissionCache(cacheKey, data) {
        try {
            localStorage.setItem(cacheKey, JSON.stringify({
                savedAt: Date.now(),
                data
            }));
        } catch (error) {
            console.warn('Could not save submissions cache:', error);
        }
    }

    async function loadDaysForClass(className) {
        const classData = CLASSES_DATA[className];
        if (!classData) return [];
        if (classData.loaded) return classData.days; // already loaded this session

        // Check browser localStorage cache first — avoids HTTP request on refresh
        const lsKey = `gradingDays_${className}`;
        const cached = localStorage.getItem(lsKey);
        if (cached) {
            try {
                const cachedDays = JSON.parse(cached);
                if (!Array.isArray(cachedDays) || cachedDays.length === 0) {
                    localStorage.removeItem(lsKey);
                    throw new Error('Empty day cache');
                }

                classData.days = cachedDays;
                classData.loaded = true;
                renderSidebarDays(className);
                if (activeTabId === className) {
                    updateDayOptions(className, selectedDaysByClass[className]);
                }
                return classData.days; // done — no network call needed
            } catch (e) {
                localStorage.removeItem(lsKey); // corrupted, fall through to fetch
            }
        }

        // Cache miss — fetch from server (server reads its own file cache, not Drive)
        try {
            const res = await fetch(`/api/days?class=${encodeURIComponent(className)}`);
            const days = await res.json();
            classData.days = days;
            classData.loaded = true;
            localStorage.setItem(lsKey, JSON.stringify(days)); // persist for next refresh

            renderSidebarDays(className);
            if (activeTabId === className) {
                updateDayOptions(className, selectedDaysByClass[className]);
            }
            return classData.days;
        } catch (err) {
            console.error(`Failed to load days for ${className}:`, err);
            return [];
        }
    }

    function readSavedPosition() {
        const fallback = {
            openTabs: [],
            activeTabId: null,
            selectedDaysByClass: {},
            expandedClasses: [],
            mainScrollTop: 0
        };

        try {
            const parsed = JSON.parse(localStorage.getItem(APP_POSITION_KEY) || '{}');
            const openTabs = Array.isArray(parsed.openTabs)
                ? parsed.openTabs.filter(isKnownClass)
                : [];

            const selectedDaysByClass = {};
            if (parsed.selectedDaysByClass && typeof parsed.selectedDaysByClass === 'object') {
                Object.entries(parsed.selectedDaysByClass).forEach(([className, day]) => {
                    if (isKnownClass(className) && isKnownDay(className, day)) {
                        selectedDaysByClass[className] = String(day);
                    }
                });
            }

            const activeTabId = openTabs.includes(parsed.activeTabId)
                ? parsed.activeTabId
                : (openTabs[0] || null);

            const expandedClasses = Array.isArray(parsed.expandedClasses)
                ? parsed.expandedClasses.filter(isKnownClass)
                : [];

            return {
                openTabs,
                activeTabId,
                selectedDaysByClass,
                expandedClasses,
                mainScrollTop: Number.isFinite(parsed.mainScrollTop) ? parsed.mainScrollTop : 0
            };
        } catch (error) {
            return fallback;
        }
    }

    const savedPosition = readSavedPosition();
    let openTabs = savedPosition.openTabs.map(className => ({ id: className, label: className }));
    if (openTabs.length === 0) {
        openTabs = DEFAULT_TABS.map(tab => ({ ...tab }));
    }
    let activeTabId = savedPosition.activeTabId || openTabs[0]?.id || null;
    const selectedDaysByClass = { ...savedPosition.selectedDaysByClass };
    const expandedStudentRows = new Set();
    let latestSubmissionsRequestId = 0;
    let latestClassOpenRequestId = 0;
    let submissionsFetchController = null;
    let didRestoreScrollPosition = false;

    function getExpandedClasses() {
        return Array.from(document.querySelectorAll('.class-group.expanded'))
            .map(group => group.dataset.class)
            .filter(Boolean);
    }

    function getLatestDayValue(className) {
        const [latestDay] = getClassDays(className);
        return latestDay ? String(latestDay.day) : '';
    }

    function savePosition() {
        const state = {
            openTabs: openTabs.map(tab => tab.id),
            activeTabId,
            selectedDaysByClass,
            expandedClasses: getExpandedClasses(),
            mainScrollTop: mainContent.scrollTop
        };

        localStorage.setItem(APP_POSITION_KEY, JSON.stringify(state));
    }

    function restoreExpandedClasses() {
        savedPosition.expandedClasses.forEach(className => {
            document.querySelector(`.class-group[data-class="${className}"]`)?.classList.add('expanded');
        });
    }

    function restoreMainScrollPosition() {
        if (didRestoreScrollPosition) return;
        didRestoreScrollPosition = true;
        requestAnimationFrame(() => {
            mainContent.scrollTop = savedPosition.mainScrollTop;
        });
    }

    function updateDayOptions(className, selectedDay) {
        const days = getClassDays(className);
        const nextDay = selectedDay && days.some(item => String(item.day) === String(selectedDay)) ? String(selectedDay) : '';

        daySelect.innerHTML = days.map(dayInfo => (
            `<option value="${dayInfo.day}">${getDayLabel(className, dayInfo.day)}</option>`
        )).join('');

        daySelect.value = nextDay;
        dayBadge.textContent = nextDay ? getDayLabel(className, nextDay) : 'Select day';
        setDayRefreshState('idle');
        renderDayDropdown();
    }

    function updateSidebarSelection(className, day) {
        document.querySelectorAll('.class-group').forEach(group => {
            group.classList.toggle('active', group.dataset.class === className);
        });

        document.querySelectorAll('.date-entry').forEach(entry => {
            const isActive = entry.dataset.class === className && entry.dataset.day === String(day);
            entry.classList.toggle('active', isActive);
        });
    }

    function clearSidebarSelection() {
        document.querySelectorAll('.class-group, .date-entry').forEach(entry => {
            entry.classList.remove('active');
        });
    }

    function selectDay(day, { forceRefresh = false } = {}) {
        daySelect.value = day;
        dayBadge.textContent = getDayLabel(activeTabId, day);
        daySelect.dispatchEvent(new CustomEvent('change', {
            detail: { forceRefresh }
        }));
    }

    function renderDayDropdown() {
        if (!activeTabId) {
            dayDropdown.innerHTML = '';
            return;
        }

        const days = getClassDays(activeTabId);
        const currentDay = String(daySelect.value);

        dayDropdown.innerHTML = days.map(dayInfo => {
            const dayValue = String(dayInfo.day);
            const isActive = dayValue === currentDay;
            return `
                <div class="dropdown-item${isActive ? ' active' : ''}" data-day="${dayValue}">
                    ${getDayLabel(activeTabId, dayInfo.day)}
                </div>
            `;
        }).join('');
    }

    function closeDayDropdown() {
        dayDropdown.classList.remove('show');
        dayDropdown.closest('.badge-dropdown')?.classList.remove('open');
    }

    function toggleDayDropdown() {
        const isShowing = dayDropdown.classList.contains('show');
        closeDayDropdown();
        if (!isShowing && activeTabId) {
            renderDayDropdown();
            dayDropdown.classList.add('show');
            dayDropdown.closest('.badge-dropdown')?.classList.add('open');
        }
    }

    renderSidebar();
    restoreExpandedClasses();

    // ============================
    //  Tab Switching
    // ============================
    function renderTabs() {
        workspace.classList.toggle('workspace-empty', openTabs.length === 0);

        if (openTabs.length === 0) {
            tabsBar.innerHTML = '';
            return;
        }

        tabsBar.innerHTML = openTabs.map(tab => {
            const isActive = tab.id === activeTabId;
            return `
                <div
                    class="tab${isActive ? ' active' : ''}"
                    data-class="${tab.id}"
                    role="tab"
                    tabindex="0"
                    aria-selected="${isActive}"
                    title="${tab.label}"
                >
                    <span class="tab-title">${tab.label}</span>
                    <button class="tab-close" type="button" aria-label="Close ${tab.label}">
                        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');
    }

    function showEmptyWorkspace() {
        loadingIndicator.classList.add('hidden');
        submissionsList.innerHTML = '';
        daySelect.value = '';
        dayBadge.textContent = 'Select day';
        dayDropdown.innerHTML = '';
        setDayRefreshState('idle');
    }

    function renderGradingSkeleton(rowCount = 6) {
        const table = document.createElement('div');
        table.className = 'grading-table skeleton-table';

        const header = document.createElement('div');
        header.className = 'grading-header';
        const headerRow = document.createElement('div');
        headerRow.className = 'grading-row';
        headerRow.innerHTML = `
            <div class="grading-cell header-cell">${HEADER_ICONS.student} Student</div>
            <div class="grading-cell header-cell">${HEADER_ICONS.name} Name</div>
            <div class="grading-cell header-cell">${HEADER_ICONS.submission} Submission</div>
            <div class="grading-cell header-cell">${HEADER_ICONS.comments} Comments</div>
        `;
        header.appendChild(headerRow);
        table.appendChild(header);

        const body = document.createElement('div');
        body.className = 'grading-body';
        for (let i = 0; i < rowCount; i++) {
            const row = document.createElement('div');
            row.className = 'grading-row';
            row.innerHTML = `
                <div class="grading-cell student-cell"><span class="skeleton-dot"></span><span class="skeleton-line skeleton-student"></span></div>
                <div class="grading-cell name-cell"><span class="skeleton-line skeleton-name"></span></div>
                <div class="grading-cell submission-cell"><span class="skeleton-play"></span><span class="skeleton-line skeleton-audio"></span><span class="skeleton-line skeleton-time"></span></div>
                <div class="grading-cell comment-cell"><span class="skeleton-line skeleton-comment"></span></div>
            `;
            body.appendChild(row);
        }
        table.appendChild(body);

        submissionsList.innerHTML = '';
        submissionsList.appendChild(table);
    }

    function activateTab(tabId) {
        if (activeTabId === tabId) return;
        activeTabId = tabId;
        const selectedDay = selectedDaysByClass[activeTabId];
        updateDayOptions(activeTabId, selectedDay);
        renderTabs();
        updateSidebarSelection(activeTabId, selectedDay);
        if (selectedDay) {
            daySelect.dispatchEvent(new Event('change'));
        } else {
            showEmptyWorkspace();
            savePosition();
        }
    }

    function openClassTab(className, day, { forceRefreshDay = false } = {}) {
        const requestId = ++latestClassOpenRequestId;
        if (!openTabs.some(tab => tab.id === className)) {
            openTabs.push({ id: className, label: className });
        }

        activeTabId = className;
        const selectedDay = day ? String(day) : getLatestDayValue(className);
        updateDayOptions(className, selectedDay);
        renderTabs();
        updateSidebarSelection(className, selectedDay);

        // Kick off dynamic day loading from Drive (no-op if already loaded)
        const daysPromise = loadDaysForClass(className);

        if (day) {
            selectDay(day, { forceRefresh: forceRefreshDay });
        } else if (selectedDay) {
            selectDay(selectedDay);
        } else {
            dayBadge.textContent = 'Loading...';
            renderGradingSkeleton();
            loadingIndicator.classList.remove('hidden');
            savePosition();
            daysPromise.then(() => {
                if (requestId !== latestClassOpenRequestId || activeTabId !== className) return;
                const latestDay = getLatestDayValue(className);
                updateDayOptions(className, latestDay);
                updateSidebarSelection(className, latestDay);
                if (latestDay) {
                    selectDay(latestDay);
                } else {
                    showEmptyWorkspace();
                    savePosition();
                }
            });
        }
    }

    function closeTab(tabId) {
        const closingIndex = openTabs.findIndex(tab => tab.id === tabId);
        if (closingIndex === -1) return;

        const wasActive = activeTabId === tabId;
        openTabs = openTabs.filter(tab => tab.id !== tabId);
        delete selectedDaysByClass[tabId];

        if (wasActive) {
            const nextTab = openTabs[Math.min(closingIndex, openTabs.length - 1)];
            activeTabId = nextTab ? nextTab.id : null;
            if (activeTabId) updateDayOptions(activeTabId, selectedDaysByClass[activeTabId]);
        }

        renderTabs();

        if (!activeTabId) {
            clearSidebarSelection();
            showEmptyWorkspace();
            savePosition();
            return;
        }

        if (wasActive) {
            const selectedDay = selectedDaysByClass[activeTabId];
            updateSidebarSelection(activeTabId, selectedDay);
            if (selectedDay) {
                daySelect.dispatchEvent(new Event('change'));
            } else {
                showEmptyWorkspace();
                savePosition();
            }
        } else {
            savePosition();
        }
    }

    tabsBar.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.tab-close');
        if (closeBtn) {
            const tab = closeBtn.closest('.tab');
            closeTab(tab.dataset.class);
            return;
        }

        const tab = e.target.closest('.tab');
        if (!tab) return;
        activateTab(tab.dataset.class);
    });

    tabsBar.addEventListener('keydown', (e) => {
        const closeBtn = e.target.closest('.tab-close');
        if (closeBtn && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            closeTab(closeBtn.closest('.tab').dataset.class);
            return;
        }

        const tab = e.target.closest('.tab');
        if (tab && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            activateTab(tab.dataset.class);
        }
    });

    // ============================
    //  App Logic
    // ============================
    daySelect.addEventListener('change', async (e) => {
        const selectedDay = e.target.value;
        const forceRefresh = Boolean(e.detail?.forceRefresh);
        if (!selectedDay) return;
        if (!activeTabId) {
            showEmptyWorkspace();
            savePosition();
            return;
        }

        const classId = activeTabId;
        selectedDaysByClass[classId] = String(selectedDay);
        const requestId = ++latestSubmissionsRequestId;
        if (submissionsFetchController) {
            submissionsFetchController.abort();
            submissionsFetchController = null;
        }
        const isCurrentRequest = () => (
            requestId === latestSubmissionsRequestId &&
            activeTabId === classId &&
            selectedDaysByClass[classId] === String(selectedDay)
        );
        
        // --- 1. Check Cache First (Instant Load) ---
        const cacheKey = `${SUBMISSIONS_CACHE_PREFIX}${classId}_${selectedDay}`;
        let cachedEntry = null;
        
        try {
            cachedEntry = readSubmissionCache(cacheKey);
        } catch (err) {
            localStorage.removeItem(cacheKey);
        }

        if (cachedEntry) {
            if (!isCurrentRequest()) return;
            dayBadge.textContent = getDayLabel(classId, selectedDay);
            renderDayDropdown();
            updateSidebarSelection(classId, selectedDay);
            renderGradingTable(cachedEntry.data, selectedDay);
            loadingIndicator.classList.add('hidden');
            savePosition();

            if (cachedEntry.isFresh && !forceRefresh) return;
        } else {
            // No cache: show loader and clear list
            loadingIndicator.classList.remove('hidden');
            renderGradingSkeleton();
        }

        // --- 2. Fetch Fresh Data in Background ---
        const fetchController = new AbortController();
        submissionsFetchController = fetchController;
        try {
            const response = await fetch(`/api/submissions?class=${encodeURIComponent(classId)}&day=${selectedDay}`, {
                signal: fetchController.signal
            });
            if (!response.ok) throw new Error(`Submissions request failed with ${response.status}`);
            const data = await response.json();
            if (!isCurrentRequest()) return;
            
            // Save to cache for next time
            writeSubmissionCache(cacheKey, data);
            
            loadingIndicator.classList.add('hidden');
            dayBadge.textContent = getDayLabel(classId, selectedDay);
            renderDayDropdown();
            updateSidebarSelection(classId, selectedDay);
            savePosition();

            // Render fresh data (replaces cached data if it was showing)
            renderGradingTable(data, selectedDay);
            restoreMainScrollPosition();
        } catch (error) {
            if (error.name === 'AbortError') return;
            if (!isCurrentRequest()) return;
            console.error('Error:', error);
            loadingIndicator.classList.add('hidden');
        } finally {
            if (submissionsFetchController === fetchController) {
                submissionsFetchController = null;
            }
        }
    });
    // ============================
    //  Expand / Collapse Animation
    // ============================
    const CHEVRON_SVG = `
        <svg class="chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
    `;

    const HEADER_ICONS = {
        student: `<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
        name: `<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
        submission: `<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
        comments: `<svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
    };
    const FILE_TYPE_ICONS = {
        audio: `<svg class="submission-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
        image: `<svg class="submission-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
        document: `<svg class="submission-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`,
        file: `<svg class="submission-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M13 2v7h7"/></svg>`,
    };
    const DRIVE_ICON = `<svg class="drive-icon" viewBox="0 0 87.3 78" aria-hidden="true"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>`;
    const EXPAND_TRANSITION_MS = 240;
    const COLLAPSE_TRANSITION_MS = 340;

    function getStudentExpansionKey(classId, day, studentId) {
        return `${classId || ''}:${day || ''}:${studentId}`;
    }

    function openBlockInstant(block) {
        const container = block.querySelector('.collapsible-rows-container');
        if (!container) return;
        block.classList.add('expanded');
        container.classList.add('is-open');
        container.style.height = 'auto';
        delete container.dataset.transitioning;
    }

    function expandBlock(block, arrow) {
        block.classList.add('expanded');
        if (block.dataset.expansionKey) {
            expandedStudentRows.add(block.dataset.expansionKey);
        }

        const container = block.querySelector('.collapsible-rows-container');
        if (!container) return;

        container.dataset.transitioning = 'true';
        container.style.height = '0px';
        container.classList.add('is-open');

        requestAnimationFrame(() => {
            container.style.height = `${container.scrollHeight}px`;
        });

        window.setTimeout(() => {
            if (!block.classList.contains('expanded')) return;
            container.style.height = 'auto';
            delete container.dataset.transitioning;
        }, EXPAND_TRANSITION_MS);
    }

    function collapseBlock(block, arrow) {
        block.classList.remove('expanded');
        if (block.dataset.expansionKey) {
            expandedStudentRows.delete(block.dataset.expansionKey);
        }

        const container = block.querySelector('.collapsible-rows-container');
        if (!container) return;

        container.dataset.transitioning = 'true';
        container.style.height = `${container.scrollHeight}px`;

        requestAnimationFrame(() => {
            container.style.height = '0px';
            container.classList.remove('is-open');
        });

        window.setTimeout(() => {
            if (block.classList.contains('expanded')) return;
            delete container.dataset.transitioning;
        }, COLLAPSE_TRANSITION_MS);
    }

    // ============================
    //  Grading Table Rendering
    // ============================
    function compareStudentsByName(a, b) {
        return (a.name || '').localeCompare(b.name || '', 'vi', {
            sensitivity: 'base',
            numeric: true
        });
    }

    let submissionPreviewModal = null;

    function getSubmissionIcon(submission) {
        return FILE_TYPE_ICONS[inferSubmissionKind(submission)] || FILE_TYPE_ICONS.file;
    }

    function getKindLabel(submission) {
        const kind = inferSubmissionKind(submission);
        return kind.charAt(0).toUpperCase() + kind.slice(1);
    }

    function buildAudioPlayerHtml(audioUrl) {
        return `
            <div class="audio-player-compact" tabindex="0" role="button" aria-label="Audio player">
                <button class="play-mini-btn" type="button" aria-label="Play audio">▶</button>
                <div class="scrubber-container">
                    <div class="scrubber-track">
                        <div class="scrubber-progress"></div>
                        <div class="scrubber-knob"></div>
                    </div>
                </div>
                <span class="time-display">--:--</span>
                <audio class="hidden-audio" src="${escapeHtml(audioUrl)}" preload="metadata"></audio>
            </div>
        `;
    }

    function buildDriveFolderButton(submission) {
        const folderUrl = getSubmissionFolderUrl(submission);
        if (!folderUrl) return '<div class="drive-folder-btn drive-folder-placeholder" aria-hidden="true"></div>';
        return `
            <a class="drive-folder-btn" href="${escapeHtml(folderUrl)}" target="_blank" rel="noopener" title="Open containing folder in Drive" aria-label="Open containing folder in Drive">
                ${DRIVE_ICON}
            </a>
        `;
    }

    function wireAudioPlayer(root) {
        const audio = root.querySelector('.hidden-audio');
        const playBtn = root.querySelector('.play-mini-btn');
        const audioPlayer = root.querySelector('.audio-player-compact');
        const progress = root.querySelector('.scrubber-progress');
        const knob = root.querySelector('.scrubber-knob');
        const timeDisplay = root.querySelector('.time-display');
        if (!audio || !playBtn || !audioPlayer || !progress || !knob || !timeDisplay) return;

        const hasUsableDuration = () => Number.isFinite(audio.duration) && audio.duration > 0;

        const updateDurationDisplay = () => {
            timeDisplay.textContent = hasUsableDuration() ? formatTime(audio.duration) : '--:--';
        };

        const updateRemainingTime = () => {
            if (!hasUsableDuration()) {
                timeDisplay.textContent = '--:--';
                return;
            }
            const remaining = Math.max(0, audio.duration - audio.currentTime);
            timeDisplay.textContent = formatTime(remaining);
        };

        const toggleAudio = () => {
            if (audio.paused) {
                document.querySelectorAll('audio').forEach(a => a.pause());
                document.querySelectorAll('.play-mini-btn').forEach(b => b.textContent = '▶');
                audio.play()
                    .then(() => {
                        playBtn.textContent = '⏸';
                    })
                    .catch(() => {
                        playBtn.textContent = '▶';
                    });
            } else {
                audio.pause();
                playBtn.textContent = '▶';
            }
        };

        playBtn.addEventListener('click', toggleAudio);
        audioPlayer.addEventListener('keydown', (event) => {
            if (event.target === playBtn || (event.key !== ' ' && event.key !== 'Enter')) return;
            event.preventDefault();
            toggleAudio();
        });

        audio.addEventListener('loadedmetadata', updateDurationDisplay);
        audio.addEventListener('durationchange', updateDurationDisplay);
        audio.addEventListener('pause', () => {
            playBtn.textContent = '▶';
        });
        audio.addEventListener('timeupdate', () => {
            if (!hasUsableDuration()) {
                progress.style.width = '0%';
                knob.style.left = '0%';
                timeDisplay.textContent = '--:--';
                return;
            }
            const pct = (audio.currentTime / audio.duration) * 100;
            progress.style.width = `${pct}%`;
            knob.style.left = `${pct}%`;
            updateRemainingTime();
        });
        audio.addEventListener('ended', () => {
            playBtn.textContent = '▶';
            progress.style.width = '0%';
            knob.style.left = '0%';
            updateDurationDisplay();
        });
    }

    function closeSubmissionPreview() {
        if (!submissionPreviewModal) return;
        submissionPreviewModal.classList.add('hidden');
        submissionPreviewModal.querySelectorAll('audio').forEach(audio => audio.pause());
    }

    function ensureSubmissionPreviewModal() {
        if (submissionPreviewModal) return submissionPreviewModal;

        const modal = document.createElement('div');
        modal.className = 'submission-preview-modal hidden';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="submission-preview-panel">
                <div class="submission-preview-header">
                    <div class="submission-preview-title-wrap">
                        <div class="submission-preview-title"></div>
                        <div class="submission-preview-meta"></div>
                    </div>
                    <div class="submission-preview-actions">
                        <a class="preview-open-link" href="#" target="_blank" rel="noopener">Open</a>
                        <button class="preview-close-btn" type="button" aria-label="Close preview">
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                                <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="submission-preview-body"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeSubmissionPreview();
        });
        modal.querySelector('.preview-close-btn').addEventListener('click', closeSubmissionPreview);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeSubmissionPreview();
            }
        });

        submissionPreviewModal = modal;
        return submissionPreviewModal;
    }

    function renderPreviewFallback(body, submission) {
        const openUrl = getSubmissionOpenUrl(submission);
        body.innerHTML = `
            <div class="preview-fallback">
                <p>Preview is not available for this file type.</p>
                ${openUrl ? `<a href="${escapeHtml(openUrl)}" target="_blank" rel="noopener">Open in Drive</a>` : ''}
            </div>
        `;
    }

    function openSubmissionPreview(submission) {
        if (!submission) return;
        const modal = ensureSubmissionPreviewModal();
        const kind = inferSubmissionKind(submission);
        const name = getSubmissionDisplayName(submission);
        const title = modal.querySelector('.submission-preview-title');
        const meta = modal.querySelector('.submission-preview-meta');
        const openLink = modal.querySelector('.preview-open-link');
        const body = modal.querySelector('.submission-preview-body');
        const openUrl = getSubmissionOpenUrl(submission);

        title.innerHTML = `${getSubmissionIcon(submission)}<span>${escapeHtml(name || 'Submission')}</span>`;
        meta.textContent = getKindLabel(submission);
        openLink.href = openUrl || '#';
        openLink.classList.toggle('hidden', !openUrl);
        body.innerHTML = '';

        if (kind === 'audio') {
            const audioUrl = getSubmissionContentUrl(submission);
            if (!audioUrl) {
                renderPreviewFallback(body, submission);
            } else {
                body.innerHTML = `<div class="preview-audio">${buildAudioPlayerHtml(audioUrl)}</div>`;
                wireAudioPlayer(body);
            }
        } else if (kind === 'image') {
            const imageUrl = getSubmissionContentUrl(submission);
            if (!imageUrl) {
                renderPreviewFallback(body, submission);
            } else {
                body.innerHTML = `
                    <div class="preview-image-stage">
                        <img class="submission-preview-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}">
                        <div class="preview-fallback hidden">
                            <p>This image format may need Drive preview.</p>
                            ${openUrl ? `<a href="${escapeHtml(openUrl)}" target="_blank" rel="noopener">Open in Drive</a>` : ''}
                        </div>
                    </div>
                `;
                const image = body.querySelector('.submission-preview-image');
                const fallback = body.querySelector('.preview-fallback');
                image.addEventListener('error', () => {
                    image.classList.add('hidden');
                    fallback?.classList.remove('hidden');
                });
            }
        } else if (kind === 'document') {
            const previewUrl = getSubmissionPreviewUrl(submission);
            if (!previewUrl) {
                renderPreviewFallback(body, submission);
            } else {
                body.innerHTML = `
                    <iframe
                        class="submission-preview-frame"
                        src="${escapeHtml(previewUrl)}"
                        title="${escapeHtml(name || 'Document preview')}"
                    ></iframe>
                `;
            }
        } else {
            renderPreviewFallback(body, submission);
        }

        modal.classList.remove('hidden');
    }

    function renderGradingTable(students, selectedDay) {
        const sortedStudents = [...students].sort(compareStudentsByName);

        if (sortedStudents.length === 0) {
            submissionsList.innerHTML = `<div class="placeholder-state"><p>No submissions found.</p></div>`;
            return;
        }

        const table = document.createElement('div');
        table.className = 'grading-table';

        // Sticky header
        const header = document.createElement('div');
        header.className = 'grading-header';
        
        const headerRow = document.createElement('div');
        headerRow.className = 'grading-row';
        headerRow.innerHTML = `
            <div class="grading-cell header-cell">${HEADER_ICONS.student} Student</div>
            <div class="grading-cell header-cell">${HEADER_ICONS.name} Name</div>
            <div class="grading-cell header-cell">${HEADER_ICONS.submission} Submission</div>
            <div class="grading-cell header-cell">${HEADER_ICONS.comments} Comments</div>
        `;
        header.appendChild(headerRow);
        table.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'grading-body';

        sortedStudents.forEach(student => {
            const block = document.createElement('div');
            block.className = 'student-block';
            block.dataset.studentId = student.id;
            block.dataset.expansionKey = getStudentExpansionKey(activeTabId, selectedDay, student.id);

            const submissionFiles = getSubmissionFiles(student);
            const hasSubmissions = submissionFiles.length > 0;
            const hasMultiple = hasSubmissions && submissionFiles.length > 1;
            block.classList.toggle('missing-homework', !hasSubmissions);

            // Helper: build a single row given a submission and whether its student cell is shown
            const buildRow = (submission, showStudentCell) => {
                const row = document.createElement('div');
                row.className = showStudentCell ? 'grading-row' : 'grading-row sub-row';

                // --- Student Cell (first row only) ---
                if (showStudentCell) {
                    const studentCell = document.createElement('div');
                    studentCell.className = 'grading-cell student-cell clickable';
                    studentCell.innerHTML = `
                        <span class="student-toggle-arrow">${CHEVRON_SVG}</span>
                        <span class="student-name-text">${escapeHtml(student.name)}</span>
                    `;
                    studentCell.addEventListener('click', () => {
                        const isExpanded = block.classList.contains('expanded');
                        const arrow = studentCell.querySelector('.student-toggle-arrow');
                        if (isExpanded) {
                            collapseBlock(block, arrow);
                        } else {
                            expandBlock(block, arrow);
                        }
                    });
                    row.appendChild(studentCell);
                }

                // --- Name Cell ---
                const nameCell = document.createElement('div');
                nameCell.className = 'grading-cell name-cell';
                if (submission && (submission.name || submission.q)) {
                    const displayName = getSubmissionColumnName(submission);
                    nameCell.innerHTML = `
                        <div class="submission-name-display" title="${escapeHtml(displayName)}">
                            ${getSubmissionIcon(submission)}
                            <span class="name-text">${escapeHtml(displayName)}</span>
                        </div>
                    `;
                }
                row.appendChild(nameCell);

                // --- Submission Cell ---
                const submissionCell = document.createElement('div');
                submissionCell.className = 'grading-cell submission-cell';
                if (submission && (submission.name || submission.q)) {
                    const kind = inferSubmissionKind(submission);
                    const contentUrl = getSubmissionContentUrl(submission);
                    const driveFolderButton = buildDriveFolderButton(submission);

                    if (kind === 'audio' && contentUrl) {
                        submissionCell.innerHTML = `
                            <div class="submission-actions">
                                ${buildAudioPlayerHtml(contentUrl)}
                                ${driveFolderButton}
                            </div>
                        `;
                        wireAudioPlayer(submissionCell);
                    } else {
                        submissionCell.innerHTML = `
                            <div class="submission-actions">
                                <button class="preview-file-btn" type="button">
                                    <span>Preview</span>
                                </button>
                                ${driveFolderButton}
                            </div>
                        `;
                        submissionCell.querySelector('.preview-file-btn').addEventListener('click', () => {
                            openSubmissionPreview(submission);
                        });
                    }
                } else {
                    submissionCell.innerHTML = `
                        <div class="submission-actions submission-actions-empty">
                            <div class="submission-empty-main" aria-hidden="true"></div>
                            <div class="drive-folder-btn drive-folder-placeholder" aria-hidden="true"></div>
                        </div>
                    `;
                }
                row.appendChild(submissionCell);

                // --- Comment Cell ---
                const commentCell = document.createElement('div');
                commentCell.className = 'grading-cell comment-cell';
                if (submission && (submission.name || submission.q)) {
                    commentCell.innerHTML = `
                        <div class="feedback-mini-section">
                            <input type="text" class="feedback-input" placeholder="...">
                            <button class="send-btn" title="Send to Sheets">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </div>
                    `;
                    // Wire feedback
                    const sendBtn = commentCell.querySelector('.send-btn');
                    const feedbackInput = commentCell.querySelector('.feedback-input');
                    sendBtn.addEventListener('click', () => {
                        submitFeedback(student.id, selectedDay, submission.q || getSubmissionDisplayName(submission), feedbackInput.value, sendBtn);
                    });
                }
                row.appendChild(commentCell);

                return row;
            };

            if (!hasSubmissions) {
                // If no submissions, render a single row with just the student name
                block.appendChild(buildRow(null, true));
            } else {
                // First row is always visible
                block.appendChild(buildRow(submissionFiles[0], true));

                // Remaining rows live in the animated container
                if (hasMultiple) {
                    const collapsible = document.createElement('div');
                    collapsible.className = 'collapsible-rows-container';
                    submissionFiles.slice(1).forEach(submission => {
                        collapsible.appendChild(buildRow(submission, false));
                    });
                    block.appendChild(collapsible);
                    if (expandedStudentRows.has(block.dataset.expansionKey)) {
                        openBlockInstant(block);
                    }
                }
            }

            body.appendChild(block);
        });

        table.appendChild(body);
        submissionsList.innerHTML = '';
        submissionsList.appendChild(table);
        syncGradingColumnWidths(table, sortedStudents);
    }

    function syncGradingColumnWidths(table, students) {
        const measure = () => {
            const headerCells = table.querySelectorAll('.grading-header .grading-cell');
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            const textWidth = (text, sampleElement) => {
                if (!context || !sampleElement) return 0;
                const style = getComputedStyle(sampleElement);
                context.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                return context.measureText(String(text || '')).width;
            };

            const cellChromeWidth = (cell) => {
                const style = getComputedStyle(cell);
                return (
                    parseFloat(style.paddingLeft) +
                    parseFloat(style.paddingRight) +
                    parseFloat(style.borderLeftWidth) +
                    parseFloat(style.borderRightWidth)
                );
            };

            let studentWidth = Math.max(200, headerCells[0]?.scrollWidth || 0);
            const sampleStudentCell = table.querySelector('.student-cell');
            const sampleStudentText = table.querySelector('.student-name-text');
            const sampleStudentStyle = sampleStudentCell ? getComputedStyle(sampleStudentCell) : null;
            const studentGap = sampleStudentStyle ? (parseFloat(sampleStudentStyle.columnGap || sampleStudentStyle.gap) || 0) : 0;
            const studentArrowWidth = table.querySelector('.student-toggle-arrow')?.getBoundingClientRect().width || 0;
            const studentChromeWidth = sampleStudentCell ? cellChromeWidth(sampleStudentCell) : 0;
            students.forEach(student => {
                const contentWidth = studentArrowWidth + studentGap + textWidth(student.name, sampleStudentText);
                studentWidth = Math.max(studentWidth, Math.ceil(contentWidth + studentChromeWidth));
            });
            table.querySelectorAll('.student-cell').forEach(cell => {
                const arrow = cell.querySelector('.student-toggle-arrow');
                const name = cell.querySelector('.student-name-text');
                const style = getComputedStyle(cell);
                const gap = parseFloat(style.columnGap || style.gap) || 0;
                const contentWidth = (arrow?.getBoundingClientRect().width || 0) + gap + (name?.scrollWidth || 0);
                studentWidth = Math.max(studentWidth, Math.ceil(contentWidth + cellChromeWidth(cell)));
            });

            let nameWidth = Math.max(130, headerCells[1]?.scrollWidth || 0);
            const sampleNameCell = table.querySelector('.name-cell');
            const sampleNameText = table.querySelector('.name-text');
            const nameChromeWidth = sampleNameCell ? cellChromeWidth(sampleNameCell) : 0;
            students.forEach(student => {
                getSubmissionFiles(student).forEach(submission => {
                    const label = getSubmissionColumnName(submission);
                    nameWidth = Math.max(nameWidth, Math.ceil(textWidth(label, sampleNameText) + nameChromeWidth));
                });
            });
            table.querySelectorAll('.name-cell').forEach(cell => {
                const name = cell.querySelector('.name-text');
                if (!name) return;
                nameWidth = Math.max(nameWidth, Math.ceil(name.scrollWidth + cellChromeWidth(cell)));
            });

            nameWidth = Math.min(600, nameWidth);
            table.style.setProperty('--gt-student-col', `${studentWidth}px`);
            table.style.setProperty('--gt-name-col', `${nameWidth}px`);
        };

        requestAnimationFrame(measure);
        document.fonts?.ready?.then(measure).catch(() => {});
    }

    function restoreCurrentPosition() {
        renderTabs();

        if (!activeTabId) {
            clearSidebarSelection();
            showEmptyWorkspace();
            return;
        }

        const selectedDay = selectedDaysByClass[activeTabId];
        updateDayOptions(activeTabId, selectedDay);
        updateSidebarSelection(activeTabId, selectedDay);

        if (selectedDay) {
            daySelect.dispatchEvent(new Event('change'));
        } else {
            showEmptyWorkspace();
        }
    }


    dayBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDayDropdown();
    });

    dayRefreshBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        refreshCurrentDay();
    });

    dayDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;
        selectDay(item.dataset.day, { forceRefresh: true });
        closeDayDropdown();
    });

    document.addEventListener('click', closeDayDropdown);

    let scrollSaveTimer = null;
    mainContent.addEventListener('scroll', () => {
        clearTimeout(scrollSaveTimer);
        scrollSaveTimer = setTimeout(savePosition, 120);
    });

    window.addEventListener('beforeunload', savePosition);

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    async function submitFeedback(studentId, day, question, notes, buttonEl) {
        if (!notes.trim()) return;
        buttonEl.disabled = true;
        buttonEl.style.opacity = '0.5';
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, day, question, notes })
            });
            if (response.ok) {
                buttonEl.style.color = '#22c55e';
                setTimeout(() => {
                    buttonEl.disabled = false;
                    buttonEl.style.opacity = '1';
                    buttonEl.style.color = '';
                }, 2000);
            }
        } catch (error) {
            buttonEl.disabled = false;
            buttonEl.style.opacity = '1';
        }
    }
});
