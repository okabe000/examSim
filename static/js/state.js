class ExamState {
    constructor() {
        this.currentExam = null;
        this.questions = [];
        this.startTime = null;
        this.examTimer = null;
    }

    setCurrentExam(exam) {
        this.currentExam = exam;
        this.questions = [];
        this.startTime = Date.now();
    }

    addQuestion(question) {
        this.questions.push(question);
    }

    clear() {
        this.currentExam = null;
        this.questions = [];
        this.startTime = null;
        if (this.examTimer) {
            clearInterval(this.examTimer);
            this.examTimer = null;
        }
    }

    getElapsedTime() {
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    getRemainingTime() {
        if (!this.currentExam || !this.startTime) return 0;
        const totalTime = this.currentExam.examInfo.totalTime * 60;
        return Math.max(0, totalTime - this.getElapsedTime());
    }
}

const examState = new ExamState();
