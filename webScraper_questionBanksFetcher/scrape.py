from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import json
import time
from tqdm import tqdm
from concurrent.futures import ProcessPoolExecutor

def click_continue_button(driver, wait):
    """Click the continue or finish button"""
    try:
        # Try to find and click the continue button
        button = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".btn-next, .btn-finish")))
        driver.execute_script("arguments[0].click();", button)
        time.sleep(1)  # Wait for navigation
        return True
    except Exception as e:
        print(f"Error clicking button: {e}")
        return False

def get_question_data(question_block, question_number):
    """Extract question data from a question block"""
    try:
        # Get question text
        question_text = question_block.find_element(By.CLASS_NAME, "panel-title").text.strip()
        if question_text.startswith('i'):  # Remove icon text if present
            question_text = question_text[1:].strip()
        
        # Get question ID (using sequential number if not found)
        try:
            question_id = question_block.get_attribute("id").replace("question-", "")
        except:
            question_id = str(12688 + question_number)  # Generate sequential ID
        
        # Extract all answers
        choices = {}
        choice_elements = question_block.find_elements(By.CLASS_NAME, "list-group-item")
        
        for i, choice in enumerate(choice_elements):
            text = choice.text.strip()
            if text:
                key = chr(65 + i)  # Convert 0,1,2,3 to A,B,C,D
                # Remove any status indicators from the text
                text = text.split('(')[0].strip()  # Remove anything in parentheses
                choices[key] = text
        
        return {
            "id": question_id,
            "number": f"Question {question_number}",
            "question": question_text,
            "choices": choices,
            "correct_choice": "",
            "explanation": ""
        }
    except Exception as e:
        print(f"Error extracting question data: {e}")
        return None

def get_correct_answers(driver):
    """Extract correct answers from results page (fast, robust, matches actual HTML)"""
    correct_answers = {}
    print("\nAnalyzing results page...")
    start_time = time.time()
    try:
        print("Waiting for results page to load...")
        question_blocks = WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "div.panel:not(.panel-info)"))
        )
        print(f"Found {len(question_blocks)} question blocks")
        for block_index, block in enumerate(tqdm(question_blocks, desc='Extracting answers', unit='q'), 1):
            try:
                if "Your Final Report" in block.text:
                    continue
                question_number = f"Question {block_index}"
                choices = block.find_elements(By.CSS_SELECTOR, "li.list-group-item.choice-answer")
                correct = set()
                for i, choice in enumerate(choices):
                    has_check = bool(choice.find_elements(By.CSS_SELECTOR, "i.fa-check"))
                    has_thumbs_down = bool(choice.find_elements(By.CSS_SELECTOR, "i.fa-thumbs-down"))
                    if has_check:
                        key = chr(65 + i)
                        correct.add(key)
                        if has_thumbs_down:
                            print(f"Found correct answer (missed): {key}")
                        else:
                            print(f"Found correct answer (selected): {key}")
                explanation = ""
                footer = block.find_elements(By.CLASS_NAME, "panel-footer")
                if footer:
                    explanation = footer[0].text.strip()
                if correct:
                    correct_list = sorted(list(correct))
                    correct_answers[question_number] = {
                        "correct_choice": correct_list if len(correct_list) > 1 else correct_list[0],
                        "explanation": explanation
                    }
                    print(f"Added {len(correct)} correct answer(s) for {question_number}")
            except Exception as e:
                print(f"Error processing answer block {block_index}: {str(e)}")
                continue
        elapsed = time.time() - start_time
        print(f"Answer extraction completed in {elapsed:.2f} seconds.")
        return correct_answers
    except Exception as e:
        print(f"Error collecting answers: {str(e)}")
        with open("results_error.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source)
        print("Results page saved to results_error.html")
        return {}

def scrape_examcompass_test(test_num):
    chrome_options = Options()
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.page_load_strategy = 'eager'
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    driver.implicitly_wait(5)
    wait = WebDriverWait(driver, 5)
    base_url = f"https://www.examcompass.com/comptia-security-plus-practice-test-{test_num}-exam-sy0-701"
    driver.get(base_url)
    time.sleep(2)
    questions = []
    total_pages = 25
    print(f"[Test {test_num}] Starting to collect questions...")
    start_time = time.time()
    # First pass: collect all questions
    for page in tqdm(range(1, total_pages + 1), desc=f'Test {test_num} - Collecting', unit='q'):
        print(f"\n[Test {test_num}] Processing page {page} of {total_pages}")
        
        # Wait for question to load
        question_block = wait.until(EC.presence_of_element_located((By.CLASS_NAME, "panel")))
        
        # Select the first available answer (radio or checkbox)
        try:
            choice_inputs = question_block.find_elements(By.CSS_SELECTOR, "input[type='radio'], input[type='checkbox']")
            if choice_inputs:
                driver.execute_script("arguments[0].click();", choice_inputs[0])
                print(f"Selected first answer for question {page}")
            else:
                print(f"[DEBUG] No answer inputs found for question {page}")
        except Exception as e:
            print(f"[DEBUG] Error selecting answer for question {page}: {e}")
        
        # Extract question data
        question_data = get_question_data(question_block, page)
        if question_data:
            questions.append(question_data)
            print(f"Added question: {question_data['question'][:50]}...")
        
        # Click continue/finish button
        if not click_continue_button(driver, wait):
            print("Failed to proceed to next question")
            break
    
    elapsed = time.time() - start_time
    print(f"[Test {test_num}] Collected {len(questions)} questions in {elapsed:.2f}s.")

    # Collect correct answers from results page
    print(f"[Test {test_num}] Collecting correct answers from results page...")
    correct_answers = get_correct_answers(driver)
    filled = 0
    for question in questions:
        qnum = question["number"]
        if qnum in correct_answers:
            question["correct_choice"] = correct_answers[qnum]["correct_choice"]
            question["explanation"] = correct_answers[qnum]["explanation"]
            filled += 1
    print(f"[Test {test_num}] Filled correct answers for {filled}/{len(questions)} questions.")
    json_data = {
        "examInfo": {
            "id": f"security_plus_701_exam_{test_num:03}",
            "name": f"CompTIA Security+ SY0-701 Practice Exam {test_num}",
            "description": f"Practice test {test_num} for CompTIA Security+ SY0-701 certification.",
            "difficulty": "medium",
            "totalTime": 90,
            "totalQuestions": len(questions),
            "domainDistribution": {
                "General Security Concepts": 0.2,
                "Threats, Vulnerabilities, and Mitigations": 0.2,
                "Security Architecture": 0.2,
                "Security Operations": 0.2,
                "Security Program Management and Oversight": 0.2
            }
        },
        "domains": [
            {
                "domain": "General Security Concepts",
                "questions": questions
            }
        ]
    }
    out_file = f"security_plus_test{test_num}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)
    print(f"[Test {test_num}] Scraping complete. Output saved to {out_file}")
    driver.quit()

if __name__ == "__main__":
    # Run all 24 tests in parallel (adjust max_workers as needed)
    test_nums = list(range(1, 25))
    with ProcessPoolExecutor(max_workers=6) as executor:
        executor.map(scrape_examcompass_test, test_nums)
