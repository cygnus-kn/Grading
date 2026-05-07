// ============================
//  Mock Data for Sidebar
// ============================
const CLASSES_DATA = {
    'S001': { days: [1, 2, 3] },
    'S002': { days: [1, 2] },
    'S003': { days: [1, 4, 5] }
};

const DEFAULT_TABS = [];

document.addEventListener('DOMContentLoaded', () => {
    const sidebarNav = document.getElementById('sidebarNav');
    const sidebar = document.getElementById('sidebar');
    const resizeHandle = document.getElementById('sidebarResizeHandle');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    const themeToggle = document.getElementById('themeToggle');
    
    const daySelect = document.getElementById('day-select');
    const submissionsList = document.getElementById('submissions-list');
    const loadingIndicator = document.getElementById('loading-indicator');
    const studentTemplate = document.getElementById('student-template');
    const answerTemplate = document.getElementById('answer-template');
    const tabsBar = document.getElementById('tabsBar');
    const workspace = document.querySelector('.container');

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
                        <span>${className}</span>
                        <span class="class-count-badge">${data.days.length}</span>
                    </div>
                    <div class="class-children">
                        ${data.days.map(day => `
                            <div class="date-entry" data-class="${className}" data-day="${day}" onclick="window.selectHomework('${className}', '${day}')">
                                <span>Day ${day}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        sidebarNav.innerHTML = html;
    }

    window.openClassFromSidebar = (className) => {
        const group = document.querySelector(`.class-group[data-class="${className}"]`);
        group.classList.add('expanded');
        openClassTab(className);
    };

    window.selectHomework = (className, day) => {
        openClassTab(className, day);
    };

    function updateDayOptions(className, selectedDay) {
        const days = CLASSES_DATA[className]?.days || [1, 2, 3];
        const nextDay = selectedDay || (days.includes(Number(daySelect.value)) ? daySelect.value : days[0]);

        daySelect.innerHTML = days.map(day => (
            `<option value="${day}">Day ${day}</option>`
        )).join('');

        daySelect.value = String(nextDay);
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
        daySelect.dispatchEvent(new Event('change'));
    }

    renderSidebar();

    // ============================
    //  Tab Switching
    // ============================
    let openTabs = DEFAULT_TABS.map(tab => ({ ...tab }));
    let activeTabId = openTabs[0]?.id || null;

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
    }

    function activateTab(tabId) {
        if (activeTabId === tabId) return;
        activeTabId = tabId;
        updateDayOptions(activeTabId);
        renderTabs();
        daySelect.dispatchEvent(new Event('change'));
    }

    function openClassTab(className, day) {
        if (!openTabs.some(tab => tab.id === className)) {
            openTabs.push({ id: className, label: className });
        }

        activeTabId = className;
        updateDayOptions(className, day);
        renderTabs();
        updateSidebarSelection(className, daySelect.value);
        selectDay(daySelect.value);
    }

    function closeTab(tabId) {
        const closingIndex = openTabs.findIndex(tab => tab.id === tabId);
        if (closingIndex === -1) return;

        const wasActive = activeTabId === tabId;
        openTabs = openTabs.filter(tab => tab.id !== tabId);

        if (wasActive) {
            const nextTab = openTabs[Math.min(closingIndex, openTabs.length - 1)];
            activeTabId = nextTab ? nextTab.id : null;
            if (activeTabId) updateDayOptions(activeTabId);
        }

        renderTabs();

        if (!activeTabId) {
            clearSidebarSelection();
            showEmptyWorkspace();
            return;
        }

        if (wasActive) {
            daySelect.dispatchEvent(new Event('change'));
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

    renderTabs();

    // ============================
    //  App Logic
    // ============================
    daySelect.addEventListener('change', async (e) => {
        const selectedDay = e.target.value;
        if (!selectedDay) return;
        if (!activeTabId) {
            showEmptyWorkspace();
            return;
        }

        loadingIndicator.classList.remove('hidden');
        submissionsList.innerHTML = '';

        try {
            const response = await fetch(`/api/submissions?class=${encodeURIComponent(activeTabId)}&day=${selectedDay}`);
            const data = await response.json();
            loadingIndicator.classList.add('hidden');
            updateSidebarSelection(activeTabId, selectedDay);

            if (data.length === 0) {
                submissionsList.innerHTML = `<div class="placeholder-state"><p>No submissions found.</p></div>`;
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
        } catch (error) {
            console.error('Error:', error);
            loadingIndicator.classList.add('hidden');
        }
    });

    daySelect.dispatchEvent(new Event('change'));

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
