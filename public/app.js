// ============================
//  Class / Day Data (dynamic)
// ============================
// Cache: classId -> { days: [{ day: N }], loaded: bool }
const CLASSES_DATA = {
    'S001': { days: [], loaded: false },
    'S002': { days: [], loaded: false },
    'S003': { days: [], loaded: false }
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
    const dayDropdown = document.getElementById('dayDropdown');
    const submissionsList = document.getElementById('submissions-list');
    const loadingIndicator = document.getElementById('loading-indicator');
    const tabsBar = document.getElementById('tabsBar');
    const workspace = document.querySelector('.container');
    const mainContent = document.querySelector('main');
    const APP_POSITION_KEY = 'gradingAppPosition';

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
                if (CLASSES_DATA[c.id]) {
                    const days = Array.isArray(c.days) ? c.days : [];
                    CLASSES_DATA[c.id].days = days;
                    CLASSES_DATA[c.id].loaded = days.length > 0;
                }
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
        for (const [className, data] of Object.entries(CLASSES_DATA)) {
            html += `
                <div class="class-group" data-class="${className}">
                    <div class="class-header" onclick="window.openClassFromSidebar('${className}')">
                        <span class="class-title">
                            <svg class="class-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            <span>${className}</span>
                        </span>
                        <span class="class-header-meta">
                            <span class="class-count-badge">${data.days.length}</span>
                            <button class="class-chevron-btn" type="button" aria-label="Toggle ${className} days" onclick="window.toggleClassExpansion(event, '${className}')">
                                <svg class="class-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                        </span>
                    </div>
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
        if (badge) badge.textContent = days.length;

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
        openClassTab(className, day);
    };

    function getClassDays(className) {
        return [...(CLASSES_DATA[className]?.days || [])]
            .sort((a, b) => Number(b.day) - Number(a.day));
    }

    function getDayLabel(className, dayValue) {
        const dayNumber = String(dayValue).padStart(2, '0');
        return `Day ${dayNumber}`;
    }

    function getAudioDisplayName(answer) {
        const name = answer?.name || answer?.q || '';
        return name.replace(/\.[^/.]+$/, '');
    }

    function isKnownClass(className) {
        return Boolean(CLASSES_DATA[className]);
    }

    function isKnownDay(className, dayValue) {
        return getClassDays(className).some(item => String(item.day) === String(dayValue));
    }

    async function loadDaysForClass(className) {
        const classData = CLASSES_DATA[className];
        if (!classData || classData.loaded) return; // already loaded this session

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
                return; // done — no network call needed
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
        } catch (err) {
            console.error(`Failed to load days for ${className}:`, err);
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
    let didRestoreScrollPosition = false;

    function getExpandedClasses() {
        return Array.from(document.querySelectorAll('.class-group.expanded'))
            .map(group => group.dataset.class)
            .filter(Boolean);
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

    function selectDay(day) {
        daySelect.value = day;
        dayBadge.textContent = getDayLabel(activeTabId, day);
        daySelect.dispatchEvent(new Event('change'));
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

    function openClassTab(className, day) {
        if (!openTabs.some(tab => tab.id === className)) {
            openTabs.push({ id: className, label: className });
        }

        activeTabId = className;
        const selectedDay = day ? String(day) : selectedDaysByClass[className];
        updateDayOptions(className, selectedDay);
        renderTabs();
        updateSidebarSelection(className, selectedDay);

        // Kick off dynamic day loading from Drive (no-op if already loaded)
        loadDaysForClass(className);

        if (day) {
            selectDay(day);
        } else if (selectedDay) {
            selectDay(selectedDay);
        } else {
            showEmptyWorkspace();
            savePosition();
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
        if (!selectedDay) return;
        if (!activeTabId) {
            showEmptyWorkspace();
            savePosition();
            return;
        }

        const classId = activeTabId;
        selectedDaysByClass[classId] = String(selectedDay);
        const requestId = ++latestSubmissionsRequestId;
        const isCurrentRequest = () => (
            requestId === latestSubmissionsRequestId &&
            activeTabId === classId &&
            selectedDaysByClass[classId] === String(selectedDay)
        );
        
        // --- 1. Check Cache First (Instant Load) ---
        const cacheKey = `gradingSubmissions_${classId}_${selectedDay}`;
        const cachedData = localStorage.getItem(cacheKey);
        
        if (cachedData) {
            try {
                const data = JSON.parse(cachedData);
                if (!isCurrentRequest()) return;
                dayBadge.textContent = getDayLabel(classId, selectedDay);
                renderDayDropdown();
                updateSidebarSelection(classId, selectedDay);
                renderGradingTable(data, selectedDay);
                // Don't show loading indicator if we have cached data
                loadingIndicator.classList.add('hidden');
            } catch (err) {
                localStorage.removeItem(cacheKey);
            }
        } else {
            // No cache: show loader and clear list
            loadingIndicator.classList.remove('hidden');
            submissionsList.innerHTML = '';
        }

        // --- 2. Fetch Fresh Data in Background ---
        try {
            const response = await fetch(`/api/submissions?class=${encodeURIComponent(classId)}&day=${selectedDay}`);
            const data = await response.json();
            if (!isCurrentRequest()) return;
            
            // Save to cache for next time
            localStorage.setItem(cacheKey, JSON.stringify(data));
            
            loadingIndicator.classList.add('hidden');
            dayBadge.textContent = getDayLabel(classId, selectedDay);
            renderDayDropdown();
            updateSidebarSelection(classId, selectedDay);
            savePosition();

            // Render fresh data (replaces cached data if it was showing)
            renderGradingTable(data, selectedDay);
            restoreMainScrollPosition();
        } catch (error) {
            if (!isCurrentRequest()) return;
            console.error('Error:', error);
            loadingIndicator.classList.add('hidden');
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
    function renderGradingTable(students, selectedDay) {
        if (students.length === 0) {
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
            <div class="grading-cell header-cell">Student</div>
            <div class="grading-cell header-cell">Name</div>
            <div class="grading-cell header-cell">Audio</div>
            <div class="grading-cell header-cell">Comments</div>
        `;
        header.appendChild(headerRow);
        table.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'grading-body';

        students.forEach(student => {
            const block = document.createElement('div');
            block.className = 'student-block';
            block.dataset.studentId = student.id;
            block.dataset.expansionKey = getStudentExpansionKey(activeTabId, selectedDay, student.id);

            const hasAnswers = student.answers && student.answers.length > 0;
            const hasMultiple = hasAnswers && student.answers.length > 1;
            block.classList.toggle('missing-homework', !hasAnswers);

            // Helper: build a single row given an answer and whether its student cell is shown
            const buildRow = (answer, showStudentCell) => {
                const row = document.createElement('div');
                row.className = showStudentCell ? 'grading-row' : 'grading-row sub-row';

                // --- Student Cell (first row only) ---
                if (showStudentCell) {
                    const studentCell = document.createElement('div');
                    studentCell.className = 'grading-cell student-cell clickable';
                    studentCell.innerHTML = `
                        <span class="student-toggle-arrow">${CHEVRON_SVG}</span>
                        <span class="student-name-text">${student.name}</span>
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
                if (answer && (answer.name || answer.q)) {
                    nameCell.innerHTML = `<span class="name-text">${getAudioDisplayName(answer)}</span>`;
                }
                row.appendChild(nameCell);

                // --- Audio Cell ---
                const audioCell = document.createElement('div');
                audioCell.className = 'grading-cell audio-cell';
                if (answer && answer.audioUrl) {
                    audioCell.innerHTML = `
                        <div class="audio-player-compact" tabindex="0" role="button" aria-label="Audio player">
                            <button class="play-mini-btn" type="button" aria-label="Play audio">▶</button>
                            <div class="scrubber-container">
                                <div class="scrubber-track">
                                    <div class="scrubber-progress"></div>
                                    <div class="scrubber-knob"></div>
                                </div>
                            </div>
                            <span class="time-display">00:00</span>
                            <audio class="hidden-audio" src="${answer.audioUrl}"></audio>
                        </div>
                    `;
                    // Wire audio
                    const audio = audioCell.querySelector('.hidden-audio');
                    const playBtn = audioCell.querySelector('.play-mini-btn');
                    const audioPlayer = audioCell.querySelector('.audio-player-compact');
                    const progress = audioCell.querySelector('.scrubber-progress');
                    const knob = audioCell.querySelector('.scrubber-knob');
                    const timeDisplay = audioCell.querySelector('.time-display');

                    const toggleAudio = () => {
                        if (audio.paused) {
                            document.querySelectorAll('audio').forEach(a => a.pause());
                            document.querySelectorAll('.play-mini-btn').forEach(b => b.textContent = '▶');
                            audio.play();
                            playBtn.textContent = '⏸';
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

                    audio.addEventListener('timeupdate', () => {
                        if (!audio.duration) return;
                        const pct = (audio.currentTime / audio.duration) * 100;
                        progress.style.width = `${pct}%`;
                        knob.style.left = `${pct}%`;
                        timeDisplay.textContent = `${formatTime(audio.currentTime)}/${formatTime(audio.duration)}`;
                    });

                    audio.addEventListener('ended', () => {
                        playBtn.textContent = '▶';
                        progress.style.width = '0%';
                        knob.style.left = '0%';
                    });
                }
                row.appendChild(audioCell);

                // --- Comment Cell ---
                const commentCell = document.createElement('div');
                commentCell.className = 'grading-cell comment-cell';
                if (answer && (answer.name || answer.q)) {
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
                        submitFeedback(student.id, selectedDay, answer.q, feedbackInput.value, sendBtn);
                    });
                }
                row.appendChild(commentCell);

                return row;
            };

            if (!hasAnswers) {
                // If no answers, render a single row with just the student name
                block.appendChild(buildRow(null, true));
            } else {
                // First row is always visible
                block.appendChild(buildRow(student.answers[0], true));

                // Remaining rows live in the animated container
                if (hasMultiple) {
                    const collapsible = document.createElement('div');
                    collapsible.className = 'collapsible-rows-container';
                    student.answers.slice(1).forEach(answer => {
                        collapsible.appendChild(buildRow(answer, false));
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
        syncGradingColumnWidths(table, students);
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
                (student.answers || []).forEach(answer => {
                    const label = getAudioDisplayName(answer);
                    nameWidth = Math.max(nameWidth, Math.ceil(textWidth(label, sampleNameText) + nameChromeWidth));
                });
            });
            table.querySelectorAll('.name-cell').forEach(cell => {
                const name = cell.querySelector('.name-text');
                if (!name) return;
                nameWidth = Math.max(nameWidth, Math.ceil(name.scrollWidth + cellChromeWidth(cell)));
            });

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

    dayDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item) return;
        selectDay(item.dataset.day);
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
        if (isNaN(seconds)) return '00:00';
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
