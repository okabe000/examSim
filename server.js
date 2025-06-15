const http = require('http');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PORT = 3000;
const DB_PATH = path.join(__dirname, 'exam_system.db');
const EXAMS_BANK_PATH = path.join(__dirname, 'examsBank');

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.ico': 'image/x-icon'
};

// Database initialization
class DatabaseManager {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
        this.initializeTables();
    }

    initializeTables() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS exam_clusters (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS exams (
                id TEXT PRIMARY KEY,
                cluster_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                difficulty TEXT,
                total_questions INTEGER,
                total_time INTEGER,
                domain_distribution TEXT,
                file_hash TEXT,
                last_modified DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cluster_id) REFERENCES exam_clusters (id)
            )`,
            `CREATE TABLE IF NOT EXISTS exam_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id TEXT NOT NULL,
                exam_name TEXT NOT NULL,
                score INTEGER NOT NULL,
                total INTEGER NOT NULL,
                time_taken INTEGER NOT NULL,
                answers TEXT NOT NULL,
                incorrect_questions TEXT,
                is_retake BOOLEAN DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (exam_id) REFERENCES exams (id)
            )`
        ];

        tables.forEach(sql => {
            this.db.run(sql, (err) => {
                if (err) console.error('Error creating table:', err);
            });
        });
    }

    // Clustering logic based on exam names
    generateClusterId(examName) {
        // Extract base name by removing common patterns
        let baseName = examName.toLowerCase()
            .replace(/\b(practice|exam|test|mock|simulation|simulator)\b/g, '')
            .replace(/\b(sy0-\d+|n10-\d+|cs0-\d+|pt0-\d+)\b/g, '') // Remove certification codes
            .replace(/\b(v?\d+(\.\d+)?|version\s*\d+|exam\s*\d+)\b/g, '') // Remove version numbers
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Create cluster ID from cleaned name
        return baseName.replace(/\s+/g, '_');
    }

    generateClusterTitle(examName) {
        // Extract meaningful title from exam name
        let title = examName
            .replace(/\b(practice|exam|test|mock|simulation|simulator)\b/gi, '')
            .replace(/\b(sy0-\d+|n10-\d+|cs0-\d+|pt0-\d+)\b/gi, '')
            .replace(/\b(v?\d+(\.\d+)?|version\s*\d+|exam\s*\d+)\b/gi, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Capitalize first letter of each word
        return title.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    async syncExamFiles() {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(EXAMS_BANK_PATH)) {
                return reject(new Error('ExamsBank directory not found'));
            }

            const files = fs.readdirSync(EXAMS_BANK_PATH).filter(file => file.endsWith('.json'));
            let processed = 0;
            let clusters = new Set();

            const processFile = (file) => {
                return new Promise((resolveFile, rejectFile) => {
                    const filePath = path.join(EXAMS_BANK_PATH, file);
                    const stats = fs.statSync(filePath);
                    const fileHash = this.getFileHash(filePath);

                    // Check if file has changed
                    this.db.get(
                        'SELECT file_hash, last_modified FROM exams WHERE file_name = ?',
                        [file],
                        (err, row) => {
                            if (err) return rejectFile(err);

                            if (row && row.file_hash === fileHash) {
                                // File hasn't changed, skip
                                return resolveFile();
                            }

                            try {
                                const examData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                                const examInfo = examData.examInfo;

                                const clusterId = this.generateClusterId(examInfo.name);
                                const clusterTitle = this.generateClusterTitle(examInfo.name);
                                clusters.add(clusterId);

                                // Insert or update cluster
                                this.db.run(
                                    'INSERT OR REPLACE INTO exam_clusters (id, title) VALUES (?, ?)',
                                    [clusterId, clusterTitle],
                                    (err) => {
                                        if (err) return rejectFile(err);

                                        // Insert or update exam
                                        this.db.run(
                                            `INSERT OR REPLACE INTO exams 
                                            (id, cluster_id, file_name, name, description, difficulty, 
                                             total_questions, total_time, domain_distribution, file_hash, last_modified)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                            [
                                                examInfo.id || file.replace('.json', ''),
                                                clusterId,
                                                file,
                                                examInfo.name,
                                                examInfo.description,
                                                examInfo.difficulty,
                                                examInfo.totalQuestions,
                                                examInfo.totalTime,
                                                JSON.stringify(examInfo.domainDistribution),
                                                fileHash,
                                                stats.mtime.toISOString()
                                            ],
                                            (err) => {
                                                if (err) return rejectFile(err);
                                                processed++;
                                                resolveFile();
                                            }
                                        );
                                    }
                                );
                            } catch (parseErr) {
                                console.error(`Error parsing ${file}:`, parseErr);
                                resolveFile(); // Continue with other files
                            }
                        }
                    );
                });
            };

            Promise.all(files.map(processFile))
                .then(() => {
                    resolve({ processed, clusters: clusters.size });
                })
                .catch(reject);
        });
    }

    getFileHash(filePath) {
        const crypto = require('crypto');
        const fileContent = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(fileContent).digest('hex');
    }

    async getExamClusters() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT 
                    c.id as cluster_id,
                    c.title as cluster_title,
                    e.id,
                    e.file_name as file,
                    e.name,
                    e.description,
                    e.difficulty,
                    e.total_questions as totalQuestions,
                    e.total_time as totalTime
                FROM exam_clusters c
                LEFT JOIN exams e ON c.id = e.cluster_id
                ORDER BY c.title, e.name
            `, [], (err, rows) => {
                if (err) return reject(err);

                const clusters = {};
                rows.forEach(row => {
                    if (!clusters[row.cluster_id]) {
                        clusters[row.cluster_id] = {
                            id: row.cluster_id,
                            title: row.cluster_title,
                            exams: []
                        };
                    }

                    if (row.id) { // Only add if exam exists
                        clusters[row.cluster_id].exams.push({
                            id: row.id,
                            file: row.file,
                            name: row.name,
                            description: row.description,
                            difficulty: row.difficulty,
                            totalQuestions: row.totalQuestions,
                            totalTime: row.totalTime
                        });
                    }
                });

                resolve(Object.values(clusters).filter(cluster => cluster.exams.length > 0));
            });
        });
    }

    async saveExamResult(examId, examResult) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO exam_results 
                (exam_id, exam_name, score, total, time_taken, answers, incorrect_questions, is_retake)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                examId,
                examResult.examName || examId,
                examResult.score,
                examResult.total,
                examResult.time,
                JSON.stringify(examResult.answers),
                JSON.stringify(examResult.incorrectQuestions || []),
                examResult.isRetake ? 1 : 0
            ], function(err) {
                if (err) return reject(err);
                resolve({ success: true, id: this.lastID });
            });
        });
    }

    async getExamResults() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT 
                    exam_id as examId,
                    exam_name,
                    score,
                    total,
                    time_taken as time,
                    answers,
                    incorrect_questions,
                    is_retake,
                    timestamp
                FROM exam_results
                ORDER BY timestamp DESC
            `, [], (err, rows) => {
                if (err) return reject(err);

                const results = rows.map(row => ({
                    examId: row.examId,
                    examResult: {
                        score: row.score,
                        total: row.total,
                        time: row.time,
                        answers: JSON.parse(row.answers),
                        incorrectQuestions: JSON.parse(row.incorrect_questions || '[]'),
                        isRetake: row.is_retake === 1,
                        timestamp: new Date(row.timestamp).getTime()
                    }
                }));

                resolve(results);
            });
        });
    }

    async createRetakeExam(examId, incorrectQuestionIds) {
        return new Promise((resolve, reject) => {
            // First get the original exam file
            this.db.get(
                'SELECT file_name FROM exams WHERE id = ? OR name = ?',
                [examId, examId],
                (err, row) => {
                    if (err) return reject(err);
                    if (!row) return reject(new Error('Exam not found'));

                    try {
                        const examFilePath = path.join(EXAMS_BANK_PATH, row.file_name);
                        const originalExam = JSON.parse(fs.readFileSync(examFilePath, 'utf8'));

                        // Filter questions to only include incorrect ones
                        const filteredDomains = originalExam.domains.map(domain => ({
                            ...domain,
                            questions: domain.questions.filter(q => 
                                incorrectQuestionIds.includes(q.id)
                            )
                        })).filter(domain => domain.questions.length > 0);

                        // Create retake exam structure
                        const retakeExam = {
                            ...originalExam,
                            isRetake: true,
                            examInfo: {
                                ...originalExam.examInfo,
                                name: originalExam.examInfo.name + ' (Retake)',
                                totalQuestions: incorrectQuestionIds.length,
                                // Adjust time proportionally
                                totalTime: originalExam.examInfo.totalTime ? 
                                    Math.ceil((originalExam.examInfo.totalTime * incorrectQuestionIds.length) / originalExam.examInfo.totalQuestions) : 
                                    null
                            },
                            domains: filteredDomains
                        };

                        resolve(retakeExam);
                    } catch (fileErr) {
                        reject(fileErr);
                    }
                }
            );
        });
    }
}

// Initialize database
const dbManager = new DatabaseManager();

// Create static directories if they don't exist
const staticDir = path.join(__dirname, 'static');
const cssDir = path.join(staticDir, 'css');
const jsDir = path.join(staticDir, 'js');

if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir);
    fs.mkdirSync(cssDir);
    fs.mkdirSync(jsDir);
}

const server = http.createServer(async (req, res) => {
    console.log('Incoming request:', req.method, req.url);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        // Handle static files first
        if (req.url.startsWith('/static/')) {
            const filePath = path.join(__dirname, req.url);
            const ext = path.extname(filePath);
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            try {
                const content = fs.readFileSync(filePath, 'utf8');
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            } catch (err) {
                console.error('Error serving static file:', err);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
            }
            return;
        }

        // Serve exam file
        if (req.url.startsWith('/examSIm/examsBank/') && req.url !== '/examSIm/examsBank/') {
            const examFile = path.join(__dirname, req.url.replace('/examSIm/', ''));
            try {
                const data = fs.readFileSync(examFile, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            } catch (err) {
                console.error('Error reading exam file:', err);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Exam file not found' }));
            }
            return;
        }

        // Direct exam file serving (for backward compatibility)
        if (req.url.startsWith('/examsBank/')) {
            const examFile = path.join(__dirname, req.url);
            try {
                const data = fs.readFileSync(examFile, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            } catch (err) {
                console.error('Error reading exam file:', err);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Exam file not found' }));
            }
            return;
        }

        // API Endpoints
        if (req.url === '/getExamClusters') {
            try {
                const clusters = await dbManager.getExamClusters();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(clusters));
            } catch (err) {
                console.error('Error getting exam clusters:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to load exam clusters' }));
            }
            return;
        }

        if (req.url === '/getExamResults') {
            try {
                const results = await dbManager.getExamResults();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(results));
            } catch (err) {
                console.error('Error reading results:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to load exam results' }));
            }
            return;
        }

        if (req.method === 'POST' && req.url === '/saveExamResult') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const { examId, examResult } = JSON.parse(body);
                    const result = await dbManager.saveExamResult(examId, examResult);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (err) {
                    console.error('Error saving result:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to save exam result' }));
                }
            });
            return;
        }

        if (req.method === 'POST' && req.url === '/createRetakeExam') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const { examId, incorrectQuestionIds } = JSON.parse(body);
                    const retakeExam = await dbManager.createRetakeExam(examId, incorrectQuestionIds);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(retakeExam));
                } catch (err) {
                    console.error('Error creating retake exam:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to create retake exam: ' + err.message }));
                }
            });
            return;
        }

        if (req.method === 'POST' && req.url === '/syncExamFiles') {
            try {
                const result = await dbManager.syncExamFiles();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (err) {
                console.error('Error syncing exam files:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to sync exam files: ' + err.message }));
            }
            return;
        }

        // Legacy endpoint for backward compatibility
        if (req.url === '/getExams') {
            try {
                const clusters = await dbManager.getExamClusters();
                // Flatten all exams from all clusters for backward compatibility
                const allExams = clusters.reduce((acc, cluster) => {
                    return acc.concat(cluster.exams);
                }, []);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(allExams));
            } catch (err) {
                console.error('Error reading exams:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to load exams' }));
            }
            return;
        }

        // Serve index.html
        if (req.url === '/' || req.url === '/index.html') {
            const filePath = path.join(__dirname, 'index.html');
            try {
                let content = fs.readFileSync(filePath, 'utf8');
                content = content.replace('</body>', `
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            new ExamController();
        });
    </script>
</body>`);
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
                return;
            } catch (err) {
                console.error('Error serving index.html:', err);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('Error loading page');
                return;
            }
        }

        // Serve other static files
        let filePath = path.join(__dirname, req.url.split('?')[0]);
        const ext = path.extname(filePath);

        // Ignore source map requests
        if (filePath.endsWith('.map')) {
            res.writeHead(404);
            res.end();
            return;
        }

        try {
            const data = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
            res.end(data);
        } catch (err) {
            console.error('Error reading file:', filePath, err);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
        }

    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
});

// Initialize database and start server
server.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Initializing database and syncing exam files...');
    
    try {
        const result = await dbManager.syncExamFiles();
        console.log(`Sync completed! Processed: ${result.processed} files, Clusters: ${result.clusters}`);
    } catch (error) {
        console.error('Initial sync failed:', error);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    dbManager.db.close((err) => {
        if (err) console.error('Error closing database:', err);
        process.exit(0);
    });
});