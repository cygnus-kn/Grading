document.addEventListener('DOMContentLoaded', () => {
    const daySelect = document.getElementById('day-select');
    const submissionsList = document.getElementById('submissions-list');
    const loadingIndicator = document.getElementById('loading-indicator');
    const template = document.getElementById('submission-template');

    daySelect.addEventListener('change', async (e) => {
        const selectedDay = e.target.value;
        if (!selectedDay) return;

        // UI Feedback
        loadingIndicator.classList.remove('hidden');
        submissionsList.innerHTML = '';

        try {
            // Fetch mock submissions
            const response = await fetch(`/api/submissions?day=${selectedDay}`);
            const data = await response.json();

            loadingIndicator.classList.add('hidden');

            if (data.length === 0) {
                submissionsList.innerHTML = `
                    <div class="placeholder-state">
                        <p>No assignments found for Day ${selectedDay}.</p>
                    </div>`;
                return;
            }

            // Render each submission
            data.forEach(student => {
                const clone = template.content.cloneNode(true);
                
                clone.querySelector('.student-name').textContent = student.name;
                
                // Add initials to avatar
                const initials = student.name.split(' ').map(n => n[0]).join('');
                clone.querySelector('.avatar').textContent = initials;

                clone.querySelector('source').src = student.audioUrl;
                clone.querySelector('audio').load();

                const submitBtn = clone.querySelector('.submit-btn');
                const textarea = clone.querySelector('.feedback-notes');
                const statusMessage = clone.querySelector('.status-message');

                submitBtn.addEventListener('click', () => submitFeedback(student.id, selectedDay, textarea.value, submitBtn, statusMessage));

                submissionsList.appendChild(clone);
            });

        } catch (error) {
            console.error('Error fetching submissions:', error);
            loadingIndicator.classList.add('hidden');
            submissionsList.innerHTML = `
                <div class="placeholder-state" style="color: var(--error);">
                    <p>Error loading data. Is the server running?</p>
                </div>`;
        }
    });

    async function submitFeedback(studentId, day, notes, buttonEl, statusEl) {
        if (!notes.trim()) {
            statusEl.textContent = 'Add notes first.';
            statusEl.className = 'status-message error';
            return;
        }

        buttonEl.disabled = true;
        buttonEl.textContent = 'Sending...';
        statusEl.textContent = '';

        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ studentId, day, notes })
            });

            const result = await response.json();

            if (response.ok) {
                statusEl.textContent = '✓ Saved';
                statusEl.className = 'status-message success';
                
                // Reset button text after short delay
                setTimeout(() => {
                    buttonEl.textContent = 'Sent!';
                    buttonEl.style.background = 'var(--success)';
                    buttonEl.style.color = '#000';
                }, 300);

            } else {
                statusEl.textContent = 'Error: ' + result.error;
                statusEl.className = 'status-message error';
                buttonEl.disabled = false;
                buttonEl.textContent = 'Send to Sheets';
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
            statusEl.textContent = 'Network error.';
            statusEl.className = 'status-message error';
            buttonEl.disabled = false;
            buttonEl.textContent = 'Send to Sheets';
        }
    }
});
