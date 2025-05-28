# examSim

A web-based exam simulator for practicing with custom exam question banks in JSON format.

## Features
- Simulate exams using your own JSON files of exam questions
- Supports single and multiple-answer questions (checkboxes for multi-answer)
- Per-choice scoring for multi-answer questions
- Timer with pause/resume functionality
- Visual feedback for correct, incorrect, and partially correct answers
- Exam statistics and history tracking

## Folder Structure
- `examsBank/` — Place your exam JSON files here (excluded from git)
- `webscraper/` — For web scraping scripts and output (excluded from git)
- `static/js/` — Frontend JavaScript (UI, controller, API, state)
- `static/css/` — Stylesheets
- `exam_results.json` — Stores user results (excluded from git)
- `server.js` — Node.js backend for serving files and saving results

## Installation & Usage

### Prerequisites
- [Node.js](https://nodejs.org/) (v14 or newer recommended)

### Setup
1. Clone this repository:
   ```sh
   git clone https://github.com/okabe000/examSim
   cd examSIm/examSim
   ```
2. Place your exam JSON files in the `examsBank/` directory.
3. Install dependencies (if any):
   ```sh
   npm install
   ```
   *(No dependencies required for basic usage, but you may add your own for webscraper or enhancements.)*

### Running the App
1. Start the server:
   ```sh
   node server.js
   ```
2. Open your browser and go to [http://localhost:3000](http://localhost:3000)
3. Select an exam and start practicing!

### Notes
- Results and user data are stored in `exam_results.json` (excluded from git).
- You can add or update exams by placing new JSON files in `examsBank/`.
- For web scraping or automation, use the `webscraper/` directory.

---

For any issues or contributions, please open an issue or pull request.
