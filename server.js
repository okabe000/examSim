const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css'
};

const RESULTS_FILE = path.join(__dirname, 'exam_results.json');

const server = http.createServer((req, res) => {
    console.log('Incoming request:', req.method, req.url); // Debug log
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS request for CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/examSIm/examsBank/') {
        // List JSON files in examsBank directory
        const examsBankPath = path.join(__dirname, 'examsBank');
        console.log('Reading examsBank directory at:', examsBankPath); // Debug log
        fs.readdir(examsBankPath, (err, files) => {
            if (err) {
                console.error('Error reading examsBank directory:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Error reading directory', path: examsBankPath }));
                return;
            }
            console.log('Files found in examsBank:', files); // Debug log
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            console.log('Serving exam list:', jsonFiles); // Debug log
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(jsonFiles));
        });
        return;
    }

    // Save exam results to file
    if (req.method === 'POST' && req.url === '/saveExamResult') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            console.log('Received chunk:', chunk.length, 'bytes');
        });
        req.on('end', () => {
            console.log('POST /saveExamResult body:', body); // Debug log
            if (!body || body.trim() === '') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Empty request body' }));
                return;
            }
            try {
                // Defensive: ensure body is a valid JSON string
                const result = JSON.parse(body);
                let allResults = [];
                if (fs.existsSync(RESULTS_FILE)) {
                    const fileContent = fs.readFileSync(RESULTS_FILE, 'utf8');
                    if (fileContent.trim()) {
                        allResults = JSON.parse(fileContent);
                    }
                }
                allResults.push(result);
                fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (e) {
                console.error('Error saving exam result:', e, '\nBody was:', body);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save result', details: e.message, body }));
            }
        });
        return;
    }

    // Fetch all exam results
    if (req.method === 'GET' && req.url === '/getExamResults') {
        try {
            let allResults = [];
            if (fs.existsSync(RESULTS_FILE)) {
                const fileContent = fs.readFileSync(RESULTS_FILE, 'utf8');
                if (fileContent.trim()) {
                    allResults = JSON.parse(fileContent);
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(allResults));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load results', details: e.message }));
        }
        return;
    }

    // Serve static files (index.html, .js, .css, .json)
    let filePath = path.join(__dirname, req.url.split('?')[0]);
    if (req.url === '/' || req.url === '/index.html') {
        filePath = path.join(__dirname, 'index.html');
    }
    // If requesting from /examSIm/examsBank/...
    if (req.url.startsWith('/examSIm/')) {
        filePath = path.join(__dirname, req.url.replace('/examSIm/', ''));
    }
    const ext = path.extname(filePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading file:', filePath, err);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found', file: filePath }));
            return;
        }
        console.log('Serving file:', filePath); // Debug log
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
