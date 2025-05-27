class ExamController {
    constructor() {
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
        
        examState.examTimer = setInterval(() => {
            const remaining = examState.getRemainingTime();
            ExamUI.renderTimer(remaining);
            
            if (remaining <= 0) {
                clearInterval(examState.examTimer);
                document.getElementById('submit-btn').click();
            }
        }, 1000);
    }

    async handleSubmit() {
        if (!examState.currentExam) return;

        let score = 0;
        let answers = {};
        let incorrectQuestions = [];

        examState.questions.forEach(q => {
            const selected = document.querySelector(`input[name='${q.id}']:checked`);
            const container = document.getElementById(q.id);
            const gridItem = document.getElementById(`grid-${q.id}`);

            if (!selected) {
                gridItem.className = "grid-item grid-yellow";
                return;
            }

            answers[q.id] = selected.value;
            
            if (selected.value === q.correct) {
                score++;
                container.classList.add("correct");
                gridItem.className = "grid-item grid-green";
            } else {
                container.classList.add("incorrect");
                incorrectQuestions.push(q.id);
                const explanation = document.createElement("p");
                explanation.className = "explanation";
                explanation.innerHTML = `<strong>Explanation:</strong> ${q.explanation}`;
                container.appendChild(explanation);
                gridItem.className = "grid-item grid-red";
            }
        });        const examResult = {
            timestamp: Date.now(),
            score,
            total: examState.questions.length,
            time: examState.getElapsedTime(),
            answers,
            incorrectQuestions
        };        try {
            await ExamAPI.saveExamResult(examState.currentExam.examInfo.name, examResult);

            // Get all results to check if this is a new best score
            const allResults = await ExamAPI.getExamResults();
            const examResults = allResults.filter(r => r.examId === examState.currentExam.examInfo.name);
            
            // Calculate previous best average
            const previousBest = examResults
                .slice(0, -1) // Exclude current attempt
                .reduce((best, result) => {
                    const score = (result.examResult.score / result.examResult.total * 100);
                    return Math.max(best, score);
                }, 0);

            // Calculate current score percentage
            const currentScore = (score / examResult.total * 100).toFixed(1);
            
            // Show score alert with celebration if it's a new best
            let message = `Your Score: ${score}/${examResult.total} (${currentScore}%)`;
            if (currentScore > previousBest) {
                message += '\n🎉 Congratulations! This is your new best score! 🎉';
            }
            alert(message);

            await this.loadExamHistory();
            ExamUI.renderResults(examResult);
        } catch (error) {
            console.error('Error saving exam result:', error);
        }
    }
}
