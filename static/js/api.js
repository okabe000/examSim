class ExamAPI {
    static async getExams() {
        try {
            const response = await fetch('http://192.168.100.72:3000/getExams');
            if (!response.ok) throw new Error('Failed to fetch exams');
            return await response.json();
        } catch (error) {
            console.error('Error fetching exams:', error);
            throw error;
        }
    }    static async loadExam(filename) {
        try {
            const response = await fetch(`http://192.168.100.72:3000/examsBank/${filename}`);
            if (!response.ok) throw new Error('Failed to load exam');
            return await response.json();
        } catch (error) {
            console.error('Error loading exam:', error);
            throw error;
        }
    }

    static async getExamResults() {
        try {
            const response = await fetch('http://192.168.100.72:3000/getExamResults');
            if (!response.ok) throw new Error('Failed to fetch exam results');
            return await response.json();
        } catch (error) {
            console.error('Error loading exam results:', error);
            throw error;
        }
    }

    static async saveExamResult(examId, examResult) {
        try {
            const response = await fetch('http://192.168.100.72:3000/saveExamResult', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId, examResult })
            });
            if (!response.ok) throw new Error('Failed to save exam result');
            return await response.json();
        } catch (error) {
            console.error('Error saving exam result:', error);
            throw error;
        }
    }
}
