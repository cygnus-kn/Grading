// ============================
//  Mock Data for Sidebar
// ============================
const CLASSES_DATA = {
    'S001': { days: [1, 2, 3] },
    'S002': { days: [1, 2] },
    'S003': { days: [1, 4, 5] }
};

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
                    <div class="class-header" onclick="window.toggleClass('${className}')">
                        <span>${className}</span>
                        <span class="class-count-badge">${data.days.length}</span>
                    </div>
                    <div class="class-children">
                        ${data.days.map(day => `
                            <div class="date-entry" onclick="window.selectDay('${day}')">
                                <span>Day ${day}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        sidebarNav.innerHTML = html;
    }

    window.toggleClass = (className) => {
        const group = document.querySelector(`.class-group[data-class="${className}"]`);
        group.classList.toggle('expanded');
    };

    window.selectDay = (day) => {
        daySelect.value = day;
        daySelect.dispatchEvent(new Event('change'));
        document.querySelectorAll('.date-entry').forEach(el => {
            el.classList.toggle('active', el.textContent.trim() === `Day ${day}`);
        });
    };

    renderSidebar();

    // ============================
    //  Tab Switching
    // ============================
    tabsBar.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        daySelect.dispatchEvent(new Event('change'));
    });

    // ============================
    //  App Logic
    // ============================
    daySelect.addEventListener('change', async (e) => {
        const selectedDay = e.target.value;
        if (!selectedDay) return;

        loadingIndicator.classList.remove('hidden');
        submissionsList.innerHTML = '';

        try {
            const response = await fetch(`/api/submissions?day=${selectedDay}`);
            const data = await response.json();
            loadingIndicator.classList.add('hidden');

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
