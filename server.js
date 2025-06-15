const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.ico': 'image/x-icon'
};

const RESULTS_FILE = path.join(__dirname, 'exam_results.json');

// Create static directories if they don't exist
const staticDir = path.join(__dirname, 'static');
const cssDir = path.join(staticDir, 'css');
const jsDir = path.join(staticDir, 'js');

if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir);
    fs.mkdirSync(cssDir);
    fs.mkdirSync(jsDir);
}

const server = http.createServer((req, res) => {
    console.log('Incoming request:', req.method, req.url);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }    // Handle static files first
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

    // Get exam results
    if (req.url === '/getExamResults') {
        try {
            const results = fs.existsSync(RESULTS_FILE) ? 
                JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) : [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        } catch (err) {
            console.error('Error reading results:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load exam results' }));
        }
        return;
    }
    
    // Save exam result
    if (req.method === 'POST' && req.url === '/saveExamResult') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const examResult = JSON.parse(body);
                const results = fs.existsSync(RESULTS_FILE) ? 
                    JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) : [];
                results.push(examResult);
                fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('Error saving result:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save exam result' }));
            }
        });
        return;
    }

    // Get available exams
    if (req.url === '/getExams') {
        const examsBankPath = path.join(__dirname, 'examsBank');
        try {
            const files = fs.readdirSync(examsBankPath)
                .filter(file => file.endsWith('.json'));
            
            const examsData = files.map(file => {
                const examContent = fs.readFileSync(path.join(examsBankPath, file), 'utf8');
                const examJson = JSON.parse(examContent);
                return {
                    file: file,
                    id: examJson.examInfo.id,
                    name: examJson.examInfo.name,
                    description: examJson.examInfo.description,
                    difficulty: examJson.examInfo.difficulty,
                    totalQuestions: examJson.examInfo.totalQuestions
                };
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(examsData));
        } catch (err) {
            console.error('Error reading exams:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load exams' }));
        }
        return;
    }    // Serve index.html
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
    }// Serve other static files
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
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
