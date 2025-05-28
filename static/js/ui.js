class ExamUI {
    static currentExamId = null;

    static renderExamSelect(exams) {
        const examSelect = document.getElementById('examSelect');
        examSelect.innerHTML = '<option value="">-- Select an exam --</option>';
        
        if (!exams || !exams.length) {
            examSelect.innerHTML = '<option value="">No exams available</option>';
            this.currentExamId = null;
            return;
        }        exams.forEach(exam => {
            const option = document.createElement('option');
            option.value = exam.file;
            option.dataset.examId = exam.name; // Use exam name as ID since that's what's stored in results
            option.textContent = `[${exam.id}] ${exam.name} | Difficulty: ${exam.difficulty || 'N/A'} | Questions: ${exam.totalQuestions}`;
            examSelect.appendChild(option);
        });        // Add change event listener to track selected exam
        examSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.selectedOptions[0];
            this.currentExamId = selectedOption ? selectedOption.dataset.examId : null;
            
            // Hide history if no exam selected
            if (!this.currentExamId) {
                const historyDiv = document.getElementById('submission-history');
                historyDiv.style.display = 'none';
            }
        });
    }    static renderExamInfo(examData) {
        const info = examData.examInfo;
        document.getElementById('examInfo').innerHTML = `
            <div class="exam-info-card">
                <h3 class="exam-title">${info.name}</h3>
                <div class="exam-meta">
                    <div class="meta-item">
                        <i class="fas fa-clock"></i>
                        <span>${info.totalTime} minutes</span>
                    </div>
                    <div class="meta-item">
                        <i class="fas fa-question-circle"></i>
                        <span>${info.totalQuestions} Questions</span>
                    </div>
                </div>
                <div class="domain-distribution">
                    <h4>Domain Distribution</h4>
                    <table class="domain-table">
                        <thead>
                            <tr>
                                <th>Domain</th>
                                <th>Percentage</th>
                                <th>Progress</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(info.domainDistribution)
                                .map(([domain, percentage]) => `
                                    <tr>
                                        <td>${domain}</td>
                                        <td>${Math.round(percentage * 100)}%</td>
                                        <td>
                                            <div class="progress-bar">
                                                <div class="progress" style="width: ${Math.round(percentage * 100)}%"></div>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    static renderExam(data) {
        const examDiv = document.getElementById("exam");
        const gridBox = document.getElementById("gridBox");
        examDiv.innerHTML = "";
        document.getElementById("result").innerHTML = "";
        gridBox.innerHTML = "";

        let questionNumber = 1;
        data.domains.forEach(domain => {            const domainHeader = document.createElement("h3");
            domainHeader.textContent = domain.domain;
            domainHeader.className = 'domain-header';
            examDiv.appendChild(domainHeader);

            domain.questions.forEach((q) => {
                const qId = q.id || `Q${questionNumber}`;
                examState.addQuestion({ 
                    id: qId, 
                    correct: q.correct_choice, 
                    explanation: q.explanation,
                    domain: domain.domain 
                });

                this.renderQuestion(q, qId, questionNumber, examDiv, gridBox);
                questionNumber++;
            });
        });

        document.getElementById("submit-btn").style.display = "inline-block";
    }

    static renderQuestion(question, qId, number, examDiv, gridBox) {
        const container = document.createElement("div");
        container.className = "question-container";
        container.id = qId;

        const qText = document.createElement("p");
        qText.innerHTML = `<strong>${number}. ${qId}. ${question.question}</strong>`;
        container.appendChild(qText);
        const choices = document.createElement("div");
        choices.className = "choices";
        // Create a list for vertical layout
        const choiceList = document.createElement("div");
        choiceList.className = "choice-list";
        // Determine if this is a multi-answer question
        const isMulti = Array.isArray(question.correct_choice);
        Object.entries(question.choices).forEach(([key, val]) => {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = isMulti ? "checkbox" : "radio";
            input.name = isMulti ? qId + '[]' : qId;
            input.value = key;
            label.appendChild(input);
            label.append(` ${key}: ${val}`);
            choiceList.appendChild(label);
        });
        choices.appendChild(choiceList);
        container.appendChild(choices);
        examDiv.appendChild(container);

        const gridItem = document.createElement("div");
        gridItem.className = "grid-item grid-yellow";
        gridItem.id = `grid-${qId}`;
        gridItem.innerText = qId.replace('Q', '');
        gridItem.onclick = () => {
            const questionElement = document.getElementById(qId);
            if (questionElement) {
                questionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        gridBox.appendChild(gridItem);
    }

    static renderTimer(remaining) {
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        document.getElementById('timer').innerHTML = `
            <div class="timer">
                Time Remaining: ${minutes}:${seconds.toString().padStart(2, '0')}
            </div>
        `;
    }    static renderExamHistory(results) {
        const historyDiv = document.getElementById('submission-history');
        
        // If no exam is selected, hide the history section
        if (!this.currentExamId) {
            historyDiv.style.display = 'none';
            return;
        }

        historyDiv.style.display = 'block';
        historyDiv.innerHTML = '<h3>Previous Attempts</h3>';
        
        // Filter results for current exam and handle partial attempts
        const filteredResults = results.filter(result => {
            return result.examId === this.currentExamId && result.examResult && 
                   Object.keys(result.examResult.answers).length > 0;
        });

        if (!filteredResults || filteredResults.length === 0) {
            historyDiv.innerHTML += '<p>No previous attempts found for this exam</p>';
            return;
        }

        // Calculate overall average score
        const avgScore = filteredResults.reduce((acc, result) => 
            acc + (result.examResult.score / result.examResult.total * 100), 0) / filteredResults.length;
        
        historyDiv.innerHTML += `
            <div class="average-score">
                <h4>Overall Average: ${avgScore.toFixed(1)}%</h4>
                <p>Total Attempts: ${filteredResults.length}</p>
            </div>
        `;
        
        if (!filteredResults || filteredResults.length === 0) {
            historyDiv.innerHTML += '<p>No previous attempts found for this exam</p>';
            return;
        }

        // Add canvas for the chart
        historyDiv.innerHTML += '<canvas id="historyChart"></canvas>';        // Prepare data for the chart (limit to last 5 attempts)
        const recentResults = filteredResults.slice(-5);
        const chartData = recentResults.map((result, index) => ({
            attemptNumber: filteredResults.length - recentResults.length + index + 1,
            score: (result.examResult.score / result.examResult.total * 100).toFixed(1),
            date: new Date(result.examResult.timestamp).toLocaleDateString(),
            time: result.examResult.time
        }));        // Calculate moving average
        const calculateMovingAverage = (data, windowSize) => {
            return data.map((score, index) => {
                const start = Math.max(0, index - windowSize + 1);
                const window = data.slice(start, index + 1);
                return (window.reduce((sum, val) => sum + parseFloat(val), 0) / window.length).toFixed(1);
            });
        };

        // Create the chart
        const ctx = document.getElementById('historyChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => `Attempt ${d.attemptNumber}`),
                datasets: [{
                    label: 'Score %',
                    data: chartData.map(d => d.score),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'Moving Average',
                    data: calculateMovingAverage(chartData.map(d => d.score), 3), // 3-attempt moving average
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0
                }]
            },            options: {
                responsive: true,
                maintainAspectRatio: false,                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.label === 'Moving Average') {
                                    return `Moving Average: ${context.parsed.y}%`;
                                }
                                const data = chartData[context.dataIndex];
                                return [
                                    `Score: ${data.score}%`,
                                    `Date: ${data.date}`,
                                    `Time: ${data.time} seconds`
                                ];
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Score (%)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 12
                            }
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0.3,
                        borderWidth: 2
                    },
                    point: {
                        radius: 6,
                        hoverRadius: 8,
                        backgroundColor: 'white',
                        borderWidth: 2
                    }
                }
            }
        });
    }

    static renderResults(examResult) {
        document.getElementById("result").innerHTML = `
            <div class="result-summary">
                <h3>Exam Complete</h3>
                <p>Score: ${examResult.score}/${examResult.total} (${(examResult.score/examResult.total*100).toFixed(1)}%)</p>
                <p>Time taken: ${examResult.time} seconds</p>
                ${examResult.incorrectQuestions.length ? 
                    `<p>Incorrect questions: ${examResult.incorrectQuestions.join(', ')}</p>` : 
                    '<p>Perfect score!</p>'}
            </div>
        `;
    }

    static clearExamDisplay() {
        document.getElementById('exam').innerHTML = '';
        document.getElementById('examInfo').innerHTML = '';
        document.getElementById('timer').innerHTML = '';
        document.getElementById('gridBox').innerHTML = '';
        document.getElementById('result').innerHTML = '';
        document.getElementById('submission-history').style.display = 'none';
        document.getElementById('submit-btn').style.display = 'none';
        this.currentExamId = null;
    }
}
