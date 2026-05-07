// ============================
//  Mock Data for Sidebar
// ============================
const CLASSES_DATA = {
    'S001': { days: [{ day: 1, date: '10/04' }, { day: 2, date: '12/04' }, { day: 3, date: '14/04' }] },
    'S002': { days: [{ day: 1, date: '11/04' }, { day: 2, date: '13/04' }] },
    'S003': { days: [{ day: 1, date: '15/04' }, { day: 4, date: '18/04' }, { day: 5, date: '20/04' }] }
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
    const studentTemplate = document.getElementById('student-template');
    const answerTemplate = document.getElementById('answer-template');
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
                        ${data.days.map(day => `
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
        return CLASSES_DATA[className]?.days || [{ day: 1, date: '10/04' }, { day: 2, date: '12/04' }, { day: 3, date: '14/04' }];
    }

    function getDayLabel(className, dayValue) {
        const dayInfo = getClassDays(className).find(item => String(item.day) === String(dayValue));
        const dayNumber = String(dayValue).padStart(2, '0');
        return `[Day ${dayNumber}] ${dayInfo?.date || 'DD/MM'}`;
    }

    function isKnownClass(className) {
        return Boolean(CLASSES_DATA[className]);
    }

    function isKnownDay(className, dayValue) {
        return getClassDays(className).some(item => String(item.day) === String(dayValue));
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

        selectedDaysByClass[activeTabId] = String(selectedDay);
        loadingIndicator.classList.remove('hidden');
        submissionsList.innerHTML = '';

        try {
            const response = await fetch(`/api/submissions?class=${encodeURIComponent(activeTabId)}&day=${selectedDay}`);
            const data = await response.json();
            loadingIndicator.classList.add('hidden');
            dayBadge.textContent = getDayLabel(activeTabId, selectedDay);
            renderDayDropdown();
            updateSidebarSelection(activeTabId, selectedDay);
            savePosition();

            if (data.length === 0) {
                submissionsList.innerHTML = `<div class="placeholder-state"><p>No submissions found.</p></div>`;
                restoreMainScrollPosition();
                return;
            }

            data.forEach(student => {
                const studentClone = studentTemplate.content.cloneNode(true);
                studentClone.querySelector('.student-name').textContent = student.name;
                const answersContainer = studentClone.querySelector('.answers-container');

                student.answers.forEach(answer => {
                    const answerClone = answerTemplate.content.cloneNode(true);
                    answerClone.querySelector('.q-text').textContent = `${selectedDay}-${answer.q}`;
                    
                    const audio = answerClone.querySelector('.hidden-audio');
                    audio.src = answer.audioUrl;

                    const playBtn = answerClone.querySelector('.play-mini-btn');
                    const progress = answerClone.querySelector('.scrubber-progress');
                    const knob = answerClone.querySelector('.scrubber-knob');
                    const timeDisplay = answerClone.querySelector('.time-display');
                    const sendBtn = answerClone.querySelector('.send-btn');
                    const feedbackInput = answerClone.querySelector('.feedback-input');

                    playBtn.addEventListener('click', () => {
                        if (audio.paused) {
                            document.querySelectorAll('audio').forEach(a => a.pause());
                            document.querySelectorAll('.play-mini-btn').forEach(b => b.textContent = '▶');
                            audio.play();
                            playBtn.textContent = '⏸';
                        } else {
                            audio.pause();
                            playBtn.textContent = '▶';
                        }
                    });

                    audio.addEventListener('timeupdate', () => {
                        if (!audio.duration) return;
                        const percent = (audio.currentTime / audio.duration) * 100;
                        progress.style.width = `${percent}%`;
                        knob.style.left = `${percent}%`;
                        timeDisplay.textContent = `${formatTime(audio.currentTime)}/${formatTime(audio.duration)}`;
                    });

                    audio.addEventListener('ended', () => {
                        playBtn.textContent = '▶';
                        progress.style.width = '0%';
                        knob.style.left = '0%';
                    });

                    sendBtn.addEventListener('click', () => {
                        submitFeedback(student.id, selectedDay, answer.q, feedbackInput.value, sendBtn);
                    });

                    answersContainer.appendChild(answerClone);
                });
                submissionsList.appendChild(studentClone);
            });
            restoreMainScrollPosition();
        } catch (error) {
            console.error('Error:', error);
            loadingIndicator.classList.add('hidden');
        }
    });

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

    restoreCurrentPosition();

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
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
