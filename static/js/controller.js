class ExamController {
    constructor() {
        this.timerPaused = false;
        this.remainingTime = null;
        this.setupEventListeners();
        this.loadInitialData();
    }

    async loadExamHistory() {
        try {
            const results = await ExamAPI.getExamResults();
            ExamUI.renderExamHistory(results);
        } catch (error) {
            console.error('Failed to load exam history:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('examSelect').addEventListener('change', async (e) => {
            const selectedFile = e.target.value;
            if (!selectedFile) {
                examState.clear();
                ExamUI.clearExamDisplay();
                return;
            }

            try {
                const examData = await ExamAPI.loadExam(selectedFile);
                examState.setCurrentExam(examData);
                ExamUI.renderExam(examData);
                ExamUI.renderExamInfo(examData);
                await this.loadExamHistory();
                
                // Only start timer if exam has time limit
                if (examData.examInfo.totalTime) {
                    this.startExamTimer();
                }
            } catch (error) {
                document.getElementById('examInfo').innerHTML = 
                    `<div style="color: red">Failed to load exam: ${error.message}</div>`;
            }
        });

        document.getElementById('submit-btn').onclick = this.handleSubmit.bind(this);

        // Add sync button
        let syncBtn = document.getElementById('sync-btn');
        if (!syncBtn) {
            syncBtn = document.createElement('button');
            syncBtn.id = 'sync-btn';
            syncBtn.textContent = '🔄 Sync Exam Files';
            syncBtn.style.marginTop = '10px';
            syncBtn.style.width = '100%';
            syncBtn.onclick = this.handleSyncFiles.bind(this);
            document.getElementById('side-menu').insertBefore(syncBtn, document.getElementById('examSelect'));
        }

        // Add pause/resume button
        let pauseBtn = document.getElementById('pause-btn');
        if (!pauseBtn) {
            pauseBtn = document.createElement('button');
            pauseBtn.id = 'pause-btn';
            pauseBtn.textContent = 'Pause Timer';
            pauseBtn.style.display = 'none';
            pauseBtn.style.marginTop = '10px';
            pauseBtn.style.width = '100%';
            document.getElementById('side-menu').insertBefore(pauseBtn, document.getElementById('submit-btn'));
        }
        pauseBtn.onclick = () => {
            if (!this.timerPaused) {
                this.pauseTimer();
                pauseBtn.textContent = 'Resume Timer';
            } else {
                this.resumeTimer();
                pauseBtn.textContent = 'Pause Timer';
            }
        };
    }

    async handleSyncFiles() {
        const syncBtn = document.getElementById('sync-btn');
        const originalText = syncBtn.textContent;
        
        try {
            syncBtn.textContent = '⏳ Syncing...';
            syncBtn.disabled = true;
            
            const result = await ExamAPI.syncExamFiles();
            
            // Refresh exam list
            await this.loadInitialData();
            
            alert(`Sync completed!\nProcessed: ${result.processed || 0} files\nClusters: ${result.clusters || 0}`);
        } catch (error) {
            console.error('Sync failed:', error);
            alert('Failed to sync exam files: ' + error.message);
        } finally {
            syncBtn.textContent = originalText;
            syncBtn.disabled = false;
        }
    }

    async loadInitialData() {
        try {
            // Try to sync files first to ensure database is up to date
            await ExamAPI.syncExamFiles();
            
            const examClusters = await ExamAPI.getExamClusters();
            ExamUI.renderExamSelect(examClusters);
        } catch (error) {
            console.error('Error loading initial data:', error);
            // Fallback to regular exam loading if sync fails
            try {
                const exams = await ExamAPI.getExams();
                // Convert to simple cluster format for backward compatibility
                const simpleClusters = [{
                    id: 'default',
                    title: 'All Exams',
                    exams: exams
                }];
                ExamUI.renderExamSelect(simpleClusters);
            } catch (fallbackError) {
                console.error('Fallback loading also failed:', fallbackError);
            }
        }
    }

    startExamTimer() {
        if (examState.examTimer) clearInterval(examState.examTimer);
        this.timerPaused = false;
        this.remainingTime = null;
        document.getElementById('pause-btn').style.display = 'inline-block';
        
        examState.examTimer = setInterval(() => {
            if (this.timerPaused) return;
            const remaining = this.remainingTime !== null ? this.remainingTime : examState.getRemainingTime();
            ExamUI.renderTimer(remaining);
            if (remaining <= 0) {
                clearInterval(examState.examTimer);
                document.getElementById('submit-btn').click();
            }
        }, 1000);
    }

    pauseTimer() {
        if (!this.timerPaused) {
            this.timerPaused = true;
            this.remainingTime = examState.getRemainingTime();
            if (examState.examTimer) clearInterval(examState.examTimer);
        }
    }

    resumeTimer() {
        if (this.timerPaused) {
            this.timerPaused = false;
            if (this.remainingTime !== null) {
                examState.startTime = Date.now() - ((examState.currentExam.examInfo.totalTime * 60 - this.remainingTime) * 1000);
            }
            this.startExamTimer();
        }
    }

    async handleSubmit() {
        if (!examState.currentExam) return;

        // Stop the timer when exam is submitted
        if (examState.examTimer) {
            clearInterval(examState.examTimer);
            examState.examTimer = null;
        }

        let score = 0;
        let total = 0;
        let answers = {};
        let incorrectQuestions = [];

        examState.questions.forEach(q => {
            const isMulti = Array.isArray(q.correct);
            let selected;
            if (isMulti) {
                selected = Array.from(document.querySelectorAll(`input[name='${q.id}[]']:checked`)).map(i => i.value);
            } else {
                const radio = document.querySelector(`input[name='${q.id}']:checked`);
                selected = radio ? radio.value : null;
            }
            
            const container = document.getElementById(q.id);
            const gridItem = document.getElementById(`grid-${q.id}`);
            const choiceInputs = container.querySelectorAll('input');
            const correctChoices = isMulti ? q.correct : [q.correct];
            let correctCount = 0;
            let wrongSelected = false;
            let missedCorrect = false;

            // Highlight choices and track correctness
            choiceInputs.forEach(input => {
                const label = input.parentElement;
                const val = input.value;
                const isChecked = isMulti ? selected.includes(val) : selected === val;
                const isCorrect = correctChoices.includes(val);
                
                if (isChecked) {
                    label.style.fontWeight = 'bold';
                    label.style.textDecoration = 'underline';
                }
                
                if (isCorrect) {
                    label.style.background = '#c8e6c9';
                }
                
                if (isChecked && !isCorrect) {
                    label.style.background = '#ffcdd2';
                    wrongSelected = true;
                }
                
                if (!isChecked && isCorrect) {
                    missedCorrect = true;
                }
            });

            if (isMulti) {
                answers[q.id] = selected;
                correctCount = selected.filter(val => correctChoices.includes(val)).length;
                score += correctCount;
                total += correctChoices.length;
                
                if (correctCount === correctChoices.length && !wrongSelected && !missedCorrect) {
                    container.classList.add("correct");
                    gridItem.className = "grid-item grid-green";
                } else if (correctCount > 0) {
                    container.classList.add("partial");
                    container.style.background = '#fff9c4';
                    gridItem.className = "grid-item grid-yellow";
                    incorrectQuestions.push(q.id);
                } else {
                    container.classList.add("incorrect");
                    gridItem.className = "grid-item grid-red";
                    incorrectQuestions.push(q.id);
                }
                
                if (correctCount < correctChoices.length || wrongSelected) {
                    const explanation = document.createElement("p");
                    explanation.className = "explanation";
                    explanation.innerHTML = `<strong>Explanation:</strong> ${q.explanation}`;
                    container.appendChild(explanation);
                }
            } else {
                if (!selected) {
                    gridItem.className = "grid-item grid-yellow";
                    choiceInputs.forEach(input => {
                        if (input.value === q.correct) {
                            input.parentElement.style.background = '#c8e6c9';
                        }
                    });
                    return;
                }
                
                answers[q.id] = selected;
                total += 1;
                
                if (selected === q.correct) {
                    score++;
                    container.classList.add("correct");
                    gridItem.className = "grid-item grid-green";
                } else {
                    container.classList.add("incorrect");
                    gridItem.className = "grid-item grid-red";
                    incorrectQuestions.push(q.id);
                    
                    choiceInputs.forEach(input => {
                        if (input.value === q.correct) {
                            input.parentElement.style.background = '#c8e6c9';
                        }
                        if (input.value === selected) {
                            input.parentElement.style.background = '#ffcdd2';
                        }
                    });
                    
                    const explanation = document.createElement("p");
                    explanation.className = "explanation";
                    explanation.innerHTML = `<strong>Explanation:</strong> ${q.explanation}`;
                    container.appendChild(explanation);
                }
            }
        });

        const examResult = {
            timestamp: Date.now(),
            score,
            total,
            time: examState.getElapsedTime(),
            answers,
            incorrectQuestions,
            isRetake: examState.currentExam.isRetake || false
        };

        try {
            await ExamAPI.saveExamResult(examState.currentExam.examInfo.name, examResult);

            // Get all results to check if this is a new best score
            const allResults = await ExamAPI.getExamResults();
            const examResults = allResults.filter(r => r.examId === examState.currentExam.examInfo.name);
            const bestScore = Math.max(...examResults.map(r => r.examResult.score / r.examResult.total * 100));
            const currentScore = score / total * 100;

            // Show results with celebration if it's a new best score
            if (currentScore === bestScore && examResults.length > 1) {
                this.celebrateNewBestScore(currentScore);
            }

            ExamUI.renderResults(examResult);
            await this.loadExamHistory();
            
        } catch (error) {
            console.error('Error saving exam result:', error);
            alert('Failed to save exam result: ' + error.message);
        }
    }

    celebrateNewBestScore(score) {
        // Confetti animation
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });

        // SweetAlert notification
        Swal.fire({
            title: '🎉 New Best Score!',
            text: `Congratulations! You achieved ${score.toFixed(1)}% - your best score yet!`,
            icon: 'success',
            confirmButtonText: 'Awesome!',
            timer: 5000,
            timerProgressBar: true
        });
    }
}

// Global reference for the controller
let examController;