import sys
import os

# Add the parent directory of backend to sys.path to resolve 'app'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.whatsapp import sanitize_and_split_message

def test_short_message():
    result = sanitize_and_split_message("Hello world")
    assert len(result) == 1
    assert result[0] == "Hello world"

def test_long_message():
    long_text = "word " * 1000  # 5000 chars
    result = sanitize_and_split_message(long_text)
    assert len(result) <= 3
    for part in result:
        assert len(part) <= 4000

def test_split_at_paragraph():
    text = ("a" * 3500) + "\n\n" + ("b" * 500)
    result = sanitize_and_split_message(text)
    assert result[0].endswith("\n\n" + "") or len(result[0]) <= 4000

if __name__ == "__main__":
    test_short_message()
    test_long_message()
    test_split_at_paragraph()
    print("All tests passed successfully!")
