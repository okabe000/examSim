class ExamController {
    constructor() {
        this.timerPaused = false;
        this.remainingTime = null;
        this.setupEventListeners();
        this.loadInitialData();
    }    async loadExamHistory() {
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
                this.startExamTimer();
            } catch (error) {
                document.getElementById('examInfo').innerHTML = 
                    `<div style="color: red">Failed to load exam: ${error.message}</div>`;
            }
        });

        document.getElementById('submit-btn').onclick = this.handleSubmit.bind(this);

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
    }    async loadInitialData() {
        try {
            const exams = await ExamAPI.getExams();
            ExamUI.renderExamSelect(exams);
            // Remove initial history render as it should only show when exam is selected
        } catch (error) {
            console.error('Error loading initial data:', error);
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
            // Adjust startTime so timer resumes correctly
            if (this.remainingTime !== null) {
                examState.startTime = Date.now() - ((examState.currentExam.examInfo.totalTime * 60 - this.remainingTime) * 1000);
            }
            this.startExamTimer();
        }
    }    async handleSubmit() {
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
                // Mark examiner's selection
                if (isChecked) {
                    label.style.fontWeight = 'bold';
                    label.style.textDecoration = 'underline';
                }
                // Highlight correct answers
                if (isCorrect) {
                    label.style.background = '#c8e6c9'; // green
                }
                // Highlight wrong choices selected
                if (isChecked && !isCorrect) {
                    label.style.background = '#ffcdd2'; // red
                    wrongSelected = true;
                }
                // Missed correct
                if (!isChecked && isCorrect) {
                    missedCorrect = true;
                }
            });

            if (isMulti) {
                answers[q.id] = selected;
                // Score: +1 for each correct selected
                correctCount = selected.filter(val => correctChoices.includes(val)).length;
                score += correctCount;
                total += correctChoices.length;
                // Determine marking
                if (correctCount === correctChoices.length && !wrongSelected && !missedCorrect) {
                    container.classList.add("correct");
                    gridItem.className = "grid-item grid-green";
                } else if (correctCount > 0) {
                    container.classList.add("partial");
                    container.style.background = '#fff9c4'; // light yellow
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
                    // highlight correct answer
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
                    // highlight correct answer
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
            incorrectQuestions
        };
        try {
            await ExamAPI.saveExamResult(examState.currentExam.examInfo.name, examResult);

            // Get all results to check if this is a new best score
            const allResults = await ExamAPI.getExamResults();
            const examResults = allResults.filter(r => r.examId === examState.currentExam.examInfo.name);
            // Calculate current score percentage
            const currentScore = (score / examResult.total * 100).toFixed(1);

            // Calculate previous best average
            const previousBest = examResults
                .slice(0, -1) // Exclude current attempt
                .reduce((best, result) => {
                    const attemptScore = (result.examResult.score / result.examResult.total * 100);
                    return Math.max(best, attemptScore);
                }, 0);

            // Show score alert with celebration if it's a new best
            let message = `Your Score: ${score}/${examResult.total} (${currentScore}%)\n`;
            message += `Time taken: ${examResult.time} seconds\n`;
            if (examState.currentExam.examInfo.totalTime) {
                const timeRemaining = examState.getRemainingTime();
                if (timeRemaining > 0) {
                    message += `Time remaining: ${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60).toString().padStart(2, '0')}\n`;
                }
            }
            if (currentScore > previousBest) {
                message += '🎉 Congratulations! This is your new best score! 🎉';
            }
            alert(message);

            await this.loadExamHistory();
            ExamUI.renderResults(examResult);
        } catch (error) {
            console.error('Error saving exam result:', error);
        }
    }
}
